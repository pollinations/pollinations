import type { Context } from "hono";
import type { ImageCacheEvent } from "./analytics.ts";
import { getProviderNameFromModel } from "../../../observability/modelProvider.ts";

/**
 * Send cache hit events to Tinybird
 * @param events - Array of image cache events
 * @param c - Hono context
 * @param apiKey - Tinybird API key
 */
export async function sendToTinybird(
    events: ImageCacheEvent[],
    c: Context,
    apiKey: string,
): Promise<void> {
    try {
        // Only send cache hit events - let Node.js handle generations to avoid duplicates
        const cacheHitEvents = events.filter(event => 
            event.name === "imageServedFromExactCache" || 
            event.name === "imageServedFromSemanticCache"
        );
        
        for (const event of cacheHitEvents) {
            const imageParams = c.get("imageParams");
            const responseTime = c.get("responseTime") || 0;

            // Generate a stable message id we can also reuse as response.id
            const messageId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

            // Timestamps derived from measured response time
            const now = Date.now();
            const startIso = new Date(now - Number(responseTime)).toISOString();
            const endIso = new Date(now).toISOString();

            // Build Tinybird event to match llm_events datasource schema without modifying it
            const tinybirdEvent = {
                // Core identifiers and timestamps
                start_time: startIso,
                end_time: endIso,
                message_id: messageId,
                id: messageId,

                // Model and provider
                model: imageParams?.model,
                provider: getProviderNameFromModel(imageParams?.model),

                // Performance metrics
                duration: responseTime,
                llm_api_duration_ms: responseTime,
                standard_logging_object_response_time: responseTime,

                // Costs and status semantics (cache hits are free, considered success)
                cost: 0,
                standard_logging_object_status: "success",
                log_event_type: "image_generation",
                call_type: "image_generation",
                cache_hit: true,

                // Minimal response object to satisfy response_id/response_object extraction
                response: {
                    id: messageId,
                    object: "image.generation",
                },

                // Use the same identity header forwarded by the gateway as non-cache events
                user: c.req.header("x-github-id") || "anonymous",
                referrer: c.req.header("referer"),
                proxy_metadata: {
                    project: "image.pollinations.ai",
                    environment: "production",
                },
            } as const;

            // Send to Tinybird
            await fetch(
                `https://api.europe-west2.gcp.tinybird.co/v0/events?name=llm_events`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(tinybirdEvent),
                }
            );
        }
    } catch (error) {
        console.error("[TINYBIRD] Error sending events:", error);
    }
}