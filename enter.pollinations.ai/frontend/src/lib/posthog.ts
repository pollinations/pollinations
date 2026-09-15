import posthog, {
    type PostHogConfig,
} from "posthog-js/dist/module.no-external";

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;
export const analyticsEnabled = Boolean(token && host);

export const analyticsConfig: Partial<PostHogConfig> = {
    api_host: host,
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    capture_heatmaps: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    save_campaign_params: false,
    save_referrer: false,
    respect_dnt: true,
    before_send: (event) => {
        if (!event || !["page_viewed", "$identify"].includes(event.event))
            return null;
        // SDK defaults include full URLs/referrers and initial person
        // properties. Allow only identity and our explicit route label.
        event.properties = Object.fromEntries(
            [
                "token",
                "distinct_id",
                "$anon_distinct_id",
                "$device_id",
                "$session_id",
                "$window_id",
                "$lib",
                "$lib_version",
                "$is_identified",
                "$process_person_profile",
                "page",
            ]
                .filter((key) => key in event.properties)
                .map((key) => [key, event.properties[key]]),
        );
        event.properties.environment = import.meta.env.MODE;
        event.properties.$geoip_disable = true;
        // Person enrichment also exists outside properties in the SDK envelope.
        return {
            uuid: event.uuid,
            event: event.event,
            timestamp: event.timestamp,
            properties: event.properties,
        };
    },
};

if (analyticsEnabled) posthog.init(token, analyticsConfig);
export { posthog };
