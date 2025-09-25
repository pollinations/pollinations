import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createSimpleHash, extractPromptFromUrl } from "../util.ts";
import type { ImageParams } from "./parse-image-params.ts";

const MAX_STRING_LENGTH = 150;

type AnalyticsConfig = {
    measurementId: string;
    apiSecret: string;
};

type CacheStatus = "pending" | "hit" | "miss";

type AnalyticsParams = {
    cacheStatus: CacheStatus;
    referrer: string;
    originalPrompt: string;
    userAgent: string;
    language: string;
    model: string;
    width: number;
    height: number;
    seed: number;
    negativePrompt: string;
    enhance: boolean;
    nologo: boolean;
    quality: string;
    safe: boolean;
    nofeed: boolean;
} & Record<string, string | number | boolean>;

type ImageEventName =
    | "imageRequested"
    | "imageServedFromSemanticCache"
    | "imageServedFromExactCache"
    | "imageGenerated"
    | "imageGenerationFailed";

export type ImageCacheEvent = {
    name: ImageEventName;
    extraParams?: Record<string, string | number | null>;
};

type AnalyticsEvent = {
    name: ImageEventName;
    params: Record<string, string | number | boolean>;
};

type Env = {
    Bindings: Cloudflare.Env;
    };

export const googleAnalytics = createMiddleware<Env>(async (c, next) => {
    // Track the start time
    const startTime = Date.now();

    // Continue with the request
    await next();
    
    // Calculate total request duration
    const totalDuration = Date.now() - startTime;
    c.set("requestDuration", totalDuration);

    // collect events to send
    const events: ImageCacheEvent[] = [];

    // add analytics based on response
    if (!c.res.ok) {
        events.push({
            name: "imageGenerationFailed",
            extraParams: {
                error: `HTTP ${c.res.status}: ${c.res.statusText}`,
            },
        });
    } else if (c.res.headers.get("x-cache") === "HIT") {
        if (c.res.headers.get("x-cache-type") === "EXACT") {
            events.push({
                name: "imageServedFromExactCache",
            });
        } else if (c.res.headers.get("x-cache-type") === "SEMANTIC") {
            events.push({
                name: "imageServedFromSemanticCache",
                extraParams: {
                    semanticSimilarity: c.res.headers.get(
                        "x-semantic-similarity",
                    ),
                },
            });
        }
    } else if (c.res.headers.get("x-cache") === "MISS") {
        events.push({
            name: "imageGenerated",
        });
    } else {
        console.debug("[ANALYTICS] Ambiguous response, needs investigation");
    }

    // send it
    if (c.env.GA_MEASUREMENT_ID && c.env.GA_API_SECRET && events.length > 0) {
        const config = {
            measurementId: c.env.GA_MEASUREMENT_ID,
            apiSecret: c.env.GA_API_SECRET,
        };
        const userId = await buildUserId(c);
        const augmentedEvents = events.map((event) => ({
            name: event.name,
            params: limitStringLength(
                buildAnalyticsParams(c, event),
                MAX_STRING_LENGTH,
            ),
        }));
        c.executionCtx.waitUntil(
            sendAnalytics(config, userId, augmentedEvents),
        );
    }

    // Send to Tinybird
    if (c.env.TINYBIRD_API_KEY && events.length > 0) {
        c.executionCtx.waitUntil(
            sendToTinybird(events, c, c.env.TINYBIRD_API_KEY),
        );
    }
});

async function sendAnalytics(
    config: AnalyticsConfig,
    clientId: string,
    events: AnalyticsEvent[],
) {
    console.debug(
        `[Analytics] Sending ${events.length} events to Google Analytics.`,
    );

    const analyticsUrl = [
        "https://www.google-analytics.com/mp/collect?measurement_id=",
        config.measurementId,
        "&api_secret=",
        config.apiSecret,
    ].join("");

    const payload = {
        client_id: clientId,
        events,
    };

    // Send to Google Analytics
    const response = await fetch(analyticsUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    console.debug(
        `[Analytics] Response status for ${events.length} events:`,
        response.status,
    );
}

function buildAnalyticsParams(
    c: Context,
    event: ImageCacheEvent,
): AnalyticsParams {
    // Get parsed image parameters from context
    const imageParams = c.get("imageParams");
    
    const trackedHeaders = {
        referrer: c.req.header("referer") || c.req.header("referrer") || "",
        userAgent: c.req.header("user-agent") || "",
        language: c.req.header("accept-language") || "",
    };

    const originalPrompt = extractPromptFromUrl(new URL(c.req.url)) || "[null]";

    return {
        ...imageParams,  // Use parsed parameters from context
        ...trackedHeaders,
        cacheStatus: deriveCacheStatus(event),
        originalPrompt,
        ...event.extraParams,
    };
}

function limitStringLength(
    params: Record<string, string | number | boolean>,
    maxLength: number,
): Record<string, string | number | boolean> {
    return Object.fromEntries(
        Object.entries(params).map(([key, value]) => {
            if (typeof value === "string") {
                return [key, value.substring(0, maxLength)];
            }
            return [key, value];
        }),
    );
}

async function buildUserId(c: Context): Promise<string> {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip");
    const userAgent = c.req.header("user-agent");
    return await createSimpleHash(`${ip?.substring(0, 11) || ""}${userAgent}`);
}

function deriveCacheStatus(event: ImageCacheEvent): CacheStatus {
    const statusMap = {
        "imageRequested": "pending",
        "imageServedFromCache": "hit",
        "imageGenerated": "miss",
        "imageGenerationFailed": "miss",
    } as const;
    return statusMap[event.name];
}

async function sendToTinybird(
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
            
            // Build minimal Tinybird event - let defaults handle the rest
            const tinybirdEvent = {
                // Required/important fields only
                start_time: new Date().toISOString(),
                message_id: `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                
                // Image-specific fields
                model: imageParams?.model,
                provider: getProviderFromModel(imageParams?.model || "unknown"),
                call_type: "image_generation",
                
                // Cache status - the key field!
                cache_hit: true,
                
                // Performance - populate all duration fields consistently with existing image events
                duration: c.get("requestDuration") || 5,
                llm_api_duration_ms: c.get("requestDuration") || 5,
                standard_logging_object_response_time: c.get("requestDuration") || 5,
                
                // User info (if available)
                referrer: c.req.header("referer"),
                
                // Metadata
                proxy_metadata: {
                    project: "image.pollinations.ai",
                    environment: "production",
                },
            };

            // Send to Tinybird
            const response = await fetch(
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

            if (!response.ok) {
                console.error(`[TINYBIRD] Failed to send event: ${response.status}`);
            } else {
                console.debug(`[TINYBIRD] Sent ${event.name} event`);
            }
        }
    } catch (error) {
        console.error("[TINYBIRD] Error sending events:", error);
    }
}

function getProviderFromModel(model: string): string {
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes("flux")) return "io.net";
    if (lowerModel.includes("kontext")) return "io.net";
    if (lowerModel.includes("nanobanana")) return "google";
    if (lowerModel.includes("seedream")) return "byteplus";
    if (lowerModel.includes("turbo")) return "io.net";
    if (lowerModel.includes("gptimage")) return "azure";
    return "unknown";
}
