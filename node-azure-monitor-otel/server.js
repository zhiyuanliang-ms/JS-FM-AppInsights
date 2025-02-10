require("dotenv").config();
const { useAzureMonitor} = require("@azure/monitor-opentelemetry");
const { logs } = require("@opentelemetry/api-logs");
useAzureMonitor({
    azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    }
});

// https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-add-modify?tabs=nodejs#send-custom-telemetry-using-the-application-insights-classic-api
function trackEvent(name, properties) {
    const logger = logs.getLogger("ApplicationInsightsLogger");
    logger.emit({
        body: { name: name, version: 2 }, // version is required
        attributes: { ...properties, "_MS.baseType": "EventData" }, // https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/monitor/monitor-opentelemetry-exporter/src/utils/constants/applicationinsights.ts#L47
    });
}

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
const featureManager = new FeatureManager(featureProvider, { onFeatureEvaluated: publishTelemetry });
let TARGETING_ID = "TEST-TARGETING-ID";
const targetingContextAccessor = () => ({userId: TARGETING_ID});
const targetingSpanProcessor = {
    forceFlush() {
      return Promise.resolve();
    },
    onStart(span, _context) {
        // console.log(_context);
        span.setAttribute("TargetingId", targetingContextAccessor().userId);
    },
    onEnd(span) {},
    shutdown() {
      return Promise.resolve();
    }
};

const targetingLogProcessor = {
    onEmit(record) {
        record.setAttribute("TargetingId", targetingContextAccessor().userId);
    },
    shutdown() {
        return Promise.resolve();
    },
    forceFlush() {
        return Promise.resolve();
    }
}

const api = require("@opentelemetry/api");
const api_logs = require("@opentelemetry/api-logs");
api.trace.getTracerProvider().getDelegate().addSpanProcessor(targetingSpanProcessor);
api_logs.logs.getLoggerProvider().addLogRecordProcessor(targetingLogProcessor);


const express = require("express");
const server = express();
const PORT = 3000;

server.get("/", async (req, res) => {
    TARGETING_ID = "LZY";
    const enabled = await featureManager.isEnabled("Beta", { userId: TARGETING_ID });
    trackEvent("TestEvent", {"Tag": "Some Value"});
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});