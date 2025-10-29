import type { Context } from "hono";
import type { ImageCacheEvent } from "./analytics.ts";

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
        
        if (cacheHitEvents.length === 0) {
            return;
        }
        
        // Batch all requests with Promise.all for better performance
        const fetchPromises = cacheHitEvents.map(async (event) => {
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
                provider: "cloudflare-cache", // Cache hits are served from Cloudflare, not external providers

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

            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

            try {
                // Send to Tinybird with timeout
                const response = await fetch(
                    `https://api.europe-west2.gcp.tinybird.co/v0/events?name=llm_events`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(tinybirdEvent),
                        signal: controller.signal,
                    }
                );

                if (!response.ok) {
                    console.error(`[TINYBIRD] Failed to send event: ${response.status} ${response.statusText}`);
                }
            } catch (fetchError: any) {
                if (fetchError.name === "AbortError") {
                    console.error("[TINYBIRD] Request timed out after 3 seconds");
                } else {
                    console.error("[TINYBIRD] Fetch error:", fetchError.message);
                }
            } finally {
                clearTimeout(timeoutId);
            }
        });

        // Wait for all requests to complete
        await Promise.all(fetchPromises);
    } catch (error) {
        console.error("[TINYBIRD] Error sending events:", error);
    }
}