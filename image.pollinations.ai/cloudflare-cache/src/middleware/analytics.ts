import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createSimpleHash, extractPromptFromUrl } from "../util.ts";
import type { ImageParams } from "./parse-image-params.ts";
import { getProviderNameFromModel } from "../../../observability/modelProvider.ts";

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
    Variables: {
        imageParams: ImageParams;
        responseTime: number;
    };
};

export const googleAnalytics = createMiddleware<Env>(async (c, next) => {
    const events: ImageCacheEvent[] = [{ name: "imageRequested" }];
    
    // Track start time for response time calculation
    const startTime = Date.now();

    // run middeware stack and proxy first
    await next();
    
    // Calculate response time in milliseconds
    const responseTime = Date.now() - startTime;
    c.set("responseTime", responseTime);

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
        "imageServedFromExactCache": "hit",
        "imageServedFromSemanticCache": "hit",
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
            const responseTime = c.get("responseTime");

            // Generate a stable message id we can also reuse as response.id
            const messageId = `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Timestamps derived from measured response time
            const now = Date.now();
            const startIso = new Date(now - (Number(responseTime) || 0)).toISOString();
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

