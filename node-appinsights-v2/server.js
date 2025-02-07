require("dotenv").config();

const appInsights = require("applicationinsights");
appInsights.setup(process.env.APPINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setSendLiveMetrics(true)
    .start();

const { FeatureManager, ConfigurationObjectFeatureFlagProvider } = require("@microsoft/feature-management");
const { createTelemetryPublisher, trackEvent } = require("@microsoft/feature-management-applicationinsights-node");

const express = require("express");

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
const TARGETING_ID = "TEST-TARGETING-ID";

const targetingContextAccessor = () => ({userId: TARGETING_ID});
const attachTargetingId = (envelope) => {
    const targetingContext = targetingContextAccessor();
    if (targetingContext) {
        envelope.data.baseData.properties["TargetingId"] = targetingContext.userId;
    }
}
appInsights.defaultClient.addTelemetryProcessor(attachTargetingId);

const server = express();
const PORT = 3000;

server.get("/", async (req, res) => {
  const enabled = await featureManager.isEnabled("Beta", { userId: TARGETING_ID });
  trackEvent(appInsights.defaultClient, TARGETING_ID, { name: "TestEvent" });
  res.send(`Beta is ${enabled ? "enabled" : "disabled"}`);
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});