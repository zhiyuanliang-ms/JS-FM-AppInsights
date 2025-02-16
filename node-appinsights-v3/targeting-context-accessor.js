require("dotenv").config();

const appInsights = require("applicationinsights");
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING).start();
  
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

const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();

const targetingContextAccessor = () => {
    const req = asyncLocalStorage.getStore();
    const TARGETING_ID = req?.query.id ?? "Default";
    return { userId: TARGETING_ID };
};

const featureProvider = new ConfigurationObjectFeatureFlagProvider(config);
const publishTelemetry = (result) => { 
    const eventProperties = createFeatureEvaluationEventProperties(result);
    appInsights.defaultClient.trackEvent({ name: "FeatureEvaluation", properties: eventProperties });
};
const featureManager = new FeatureManager(
    featureProvider, 
    { 
        onFeatureEvaluated: publishTelemetry,
        targetingContextAccessor: targetingContextAccessor
    }
);

const targetingSpanProcessor = {
    forceFlush() {
      return Promise.resolve();
    },
    onStart(span, _context) {
        const req = asyncLocalStorage.getStore();
        console.log("onStart: ", req?.query);
        // span.setAttribute("TargetingId", targetingContextAccessor().userId);
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
        const req = asyncLocalStorage.getStore();
        console.log("onEmit: ", req?.query);
        record.setAttribute("TargetingId", targetingContextAccessor().userId);
    },
    shutdown() {
        return Promise.resolve();
    },
    forceFlush() {
        return Promise.resolve();
    }
}

// https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-nodejs-migrate?tabs=cleaninstall#telemetry-processors
const api = require("@opentelemetry/api");
const api_logs = require("@opentelemetry/api-logs");
api.trace.getTracerProvider().getDelegate().addSpanProcessor(targetingSpanProcessor);
api_logs.logs.getLoggerProvider().addLogRecordProcessor(targetingLogProcessor);


const express = require("express");
const server = express();
const PORT = 3000;

// middleware patern fail, in onStart, req is undefined
server.use((req, res, next) => {
    asyncLocalStorage.run(req, next);
});

server.get("/", async (req, res) => {
    const enabled = await featureManager.isEnabled("Beta");
    appInsights.defaultClient.trackEvent({ name: "TestEvent", properties: {"Tag": "Some Value"} });
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});