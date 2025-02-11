require("dotenv").config();

const appInsights = require("applicationinsights");
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setSendLiveMetrics(true)
    .start();

const { FeatureManager, ConfigurationObjectFeatureFlagProvider } = require("@microsoft/feature-management");
const { createTelemetryPublisher, trackEvent } = require("@microsoft/feature-management-applicationinsights-node");
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
const publishTelemetry = createTelemetryPublisher(appInsights.defaultClient);
const featureManager = new FeatureManager(featureProvider, { onFeatureEvaluated: publishTelemetry });
const myTargetingProcessor = (envelope, context) => {
    const targetingId = context.correlationContext?.customProperties.getProperty("TargetingId") ?? "";
    envelope.data.baseData.properties["TargetingId"] = targetingId;
}
appInsights.defaultClient.addTelemetryProcessor(myTargetingProcessor);

const express = require("express");
const server = express();
const PORT = 3000;

server.get("/", async (req, res) => {
    const TARGETING_ID = req.query.id ?? "Default";
    appInsights.getCorrelationContext()?.customProperties.setProperty("TargetingId", TARGETING_ID);
    const enabled = await featureManager.isEnabled("Beta", { userId: TARGETING_ID });
    // trackEvent(appInsights.defaultClient, TARGETING_ID, { name: "TestEvent-Node", properties: {"Tag": "Some Value"} });
    appInsights.defaultClient.trackEvent({name: "TestEvent-Node-2", properties: {"Tag": "Some Value"}});
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});