require("dotenv").config();

const appInsights = require("applicationinsights");
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setSendLiveMetrics(true)
    .start();


const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();

const targetingContextAccessor = () => {
    const req = asyncLocalStorage.getStore();
    const TARGETING_ID = req?.query.id ?? "Default";
    return { userId: TARGETING_ID };
};

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
const featureManager = new FeatureManager(
    featureProvider, 
    { 
        onFeatureEvaluated: publishTelemetry, 
        targetingContextAccessor: targetingContextAccessor 
    }
);

const myTargetingProcessor = (envelope) => {
    const targetingContext = targetingContextAccessor();
    if (targetingContext) {
        envelope.data.baseData.properties["TargetingId"] = targetingContext.userId;
    }
}
appInsights.defaultClient.addTelemetryProcessor(myTargetingProcessor);

const express = require("express");
const server = express();
const PORT = 3000;

// Use a middleware to store request object in async local storage
server.use((req, res, next) => {
    asyncLocalStorage.run(req, next);
});

server.get("/", async (req, res) => {
    const enabled = await featureManager.isEnabled("Beta");
    // trackEvent(appInsights.defaultClient, TARGETING_ID, { name: "TestEvent-Node", properties: {"Tag": "Some Value"} });
    appInsights.defaultClient.trackEvent({name: "TestEvent-Node-1", properties: {"Tag": "Some Value"}});
    res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});