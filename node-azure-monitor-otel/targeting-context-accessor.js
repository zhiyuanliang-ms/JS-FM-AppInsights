require("dotenv").config();

const { useAzureMonitor} = require("@azure/monitor-opentelemetry");
const { trace } = require("@opentelemetry/api");
const api_logs = require("@opentelemetry/api-logs");
// https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-add-modify?tabs=nodejs#send-custom-telemetry-using-the-application-insights-classic-api
function trackEvent(name, properties) {
    const logger = api_logs.logs.getLogger("ApplicationInsightsLogger");
    logger.emit({
        body: { name: name, version: 2 }, // version is required
        attributes: { ...properties, "_MS.baseType": "EventData" }, // https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/monitor/monitor-opentelemetry-exporter/src/utils/constants/applicationinsights.ts#L47
    });
};

const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();

const targetingContextAccessor = () => {
    const req = asyncLocalStorage.getStore();
    const TARGETING_ID = req?.query.id ?? "Default";
    return { userId: TARGETING_ID };
};
const targetingSpanProcessor = {
    forceFlush() {
      return Promise.resolve();
    },
    onStart(span, _context) {
        // const req = asyncLocalStorage.getStore();
        // console.log("onStart: ", req?.query); // undefined here
        // span.attributes["TargetingId"] = targetingContextAccessor().userId;
    },
    // https://www.npmjs.com/package/@azure/monitor-opentelemetry
    onEnd(span) {
        const req = asyncLocalStorage.getStore();
        console.log("onEnd: ", req?.query);
        // span.setAttribute("TargetingId", targetingContextAccessor().userId); // cannot execute on ended span
        span.attributes["TargetingId"] = targetingContextAccessor().userId;
    },
    shutdown() {
      return Promise.resolve();
    }
};

const targetingLogProcessor = {
    onEmit(record) {
        // const req = asyncLocalStorage.getStore();
        // console.log("onEmit: ", req?.query);
        record.setAttribute("TargetingId", targetingContextAccessor().userId);
    },
    shutdown() {
        return Promise.resolve();
    },
    forceFlush() {
        return Promise.resolve();
    }
}

// https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-add-modify?tabs=nodejs#add-a-custom-property-to-a-span
useAzureMonitor({
    azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    spanProcessors: [ targetingSpanProcessor ],
    logRecordProcessors: [ targetingLogProcessor ]
});

// For express
// const { registerInstrumentations } = require("@opentelemetry/instrumentation");
// const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
// const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");
// registerInstrumentations({
//     instrumentations: [
//         // new HttpInstrumentation({
//         //     ignoreIncomingRequestHook(req) {
//         //         // Ignore spans from static assets.
//         //         const isStaticAsset = !!req.url.match(/^\/static\/.*$/);
//         //         return isStaticAsset;
//         //     }
//         // }),
//         new ExpressInstrumentation(),
//     ],
// });

const { FeatureManager, ConfigurationObjectFeatureFlagProvider, createFeatureEvaluationEventProperties } = require("@microsoft/feature-management");
const config = {
    feature_management: {
        feature_flags: [
            {
                id: "Beta",
                enabled: true,
                telemetry: {
                    enabled: true
                }
            }
        ]
    }
};
const featureProvider = new ConfigurationObjectFeatureFlagProvider(config);
const publishTelemetry = (result) => { 
    const eventProperties = createFeatureEvaluationEventProperties(result);
    trackEvent("FeatureEvaluation", eventProperties);
};
const featureManager = new FeatureManager(
    featureProvider, 
    { 
        onFeatureEvaluated: publishTelemetry,
        targetingContextAccessor: targetingContextAccessor
    }
);

const express = require("express");
const server = express();
const PORT = 3000;

server.use((req, res, next) => {
    asyncLocalStorage.run(req, next);
});

server.get("/", async (req, res) => {
    const enabled = await featureManager.isEnabled("Beta");
    // const tracer = trace.getTracer();
    // const span = tracer.startSpan("TestSpan");
    // span.addEvent("Hello");
    // span.end();
    trackEvent("TestEvent", {"Tag": "Some Value"});
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});