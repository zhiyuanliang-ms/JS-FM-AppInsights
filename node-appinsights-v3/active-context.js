require("dotenv").config();

const appInsights = require("applicationinsights");
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING).start();

const api = require("@opentelemetry/api");
const api_logs = require("@opentelemetry/api-logs");

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
    appInsights.defaultClient.trackEvent({ name: "FeatureEvaluation", properties: eventProperties });
};
const featureManager = new FeatureManager(featureProvider, { onFeatureEvaluated: publishTelemetry });
const targetingLogProcessor = {
    onEmit(record) {
        // console.log(api.trace.getActiveSpan().attributes);
        record.setAttribute("TargetingId", api.trace.getActiveSpan()?.attributes["TargetingId"] ?? "");
    },
    shutdown() {
        return Promise.resolve();
    },
    forceFlush() {
        return Promise.resolve();
    }
}

api_logs.logs.getLoggerProvider().addLogRecordProcessor(targetingLogProcessor);


const express = require("express");
const server = express();
const PORT = 3000;

server.get("/", async (req, res) => {
    const TARGETING_ID = req.query.id ?? "Default";
    api.trace.getActiveSpan().setAttribute("TargetingId", TARGETING_ID);
    api.trace.getActiveSpan().addEvent("TestEvent-v3-2");
    
    // appInsights.defaultClient.trackEvent({ name: "TestEvent-v3-1", properties: {"Tag": "Some Value"} });
    const enabled = await featureManager.isEnabled("Beta", { userId: TARGETING_ID });
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});