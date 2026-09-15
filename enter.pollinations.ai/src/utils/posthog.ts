import { PostHog } from "posthog-node/edge";

// Optional until a project is approved/configured. Use the same project as
// VITE_POSTHOG_PROJECT_TOKEN / VITE_POSTHOG_HOST in the frontend build.
export async function capturePostHog(
    env: {
        ENVIRONMENT: string;
        POSTHOG_PROJECT_TOKEN?: string;
        POSTHOG_HOST?: string;
    },
    event: string,
    userId: string,
    properties: Record<string, string | number | boolean | null> = {},
): Promise<void> {
    if (!env.POSTHOG_PROJECT_TOKEN || !env.POSTHOG_HOST) return;
    try {
        const client = new PostHog(env.POSTHOG_PROJECT_TOKEN, {
            host: env.POSTHOG_HOST,
            flushInterval: 0,
            disableGeoip: true,
            fetchRetryCount: 0,
            requestTimeout: 3000,
        });
        await client.captureImmediate({
            distinctId: userId,
            event,
            properties: { ...properties, environment: env.ENVIRONMENT },
        });
    } catch {
        // Analytics must never fail auth, checkout, or webhook fulfillment.
        console.warn("PostHog event delivery failed");
    }
}
