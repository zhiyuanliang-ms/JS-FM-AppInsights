const TARGETING_ID = "TEST-TARGETING-ID";
const targetingContextAccessor = () => ({userId: TARGETING_ID});

import { ApplicationInsights } from "@microsoft/applicationinsights-web"
// https://learn.microsoft.com/azure/azure-monitor/app/javascript-sdk-configuration#sdk-configuration
const appInsights = new ApplicationInsights({ config: {
    // connectionString: "YOUR-CONNECTION-STRING",
    connectionString: "InstrumentationKey=bc50d6a4-3ae4-45f0-87ed-6827183e4ecc;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=7be47c4c-7482-4102-a965-a107bcdee540",
    accountId: TARGETING_ID

}});
appInsights.loadAppInsights();

console.log("Current App Insights user_Id: ", appInsights.context.user.id);

const attachTargetingId = (envelope) => {
    const targetingContext = targetingContextAccessor();
    if (targetingContext) {
        envelope.data = {...envelope.data, TargetingId: targetingContext.userId};
    }
}
appInsights.addTelemetryInitializer(attachTargetingId);

appInsights.trackPageView(); // must be called after telemetry initializer is added

import { FeatureManager, ConfigurationObjectFeatureFlagProvider } from "@microsoft/feature-management";
import { createTelemetryPublisher, trackEvent } from "@microsoft/feature-management-applicationinsights-browser";
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
const sendTelemetry = createTelemetryPublisher(appInsights);
const featureManager = new FeatureManager(featureProvider, {onFeatureEvaluated: sendTelemetry});


import { useEffect, useState } from "react";
function App() {
    const [isBetaEnabled, setIsBetaEnabled] = useState(undefined);

    const init = async () => {
        setIsBetaEnabled(await featureManager.isEnabled("Beta", { userId: TARGETING_ID }));
    };

    useEffect(() => {
        init();
    }, []);

    const handleButtonClick = () => {
        // trackEvent(appInsights, TARGETING_ID, {name: "TestEvent-Browser"}, {"Tag": "Some Value"});
        appInsights.trackEvent({name: "TestEvent-Browser"}, {"Tag": "Some Value"});
        console.log("Button clicked");
    };

    return (
        <>
        <div>
            <p>Beta feature flag is {isBetaEnabled === undefined ? "loading..." : isBetaEnabled ? "enabled" : "disabled"}.</p>
            <button onClick={handleButtonClick} disabled={isBetaEnabled === undefined}>TrackEvent</button>
        </div>
        </>
    )
}
    
export default App