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
    Variables: {
        imageParams: ImageParams;
    };
};

export const googleAnalytics = createMiddleware<Env>(async (c, next) => {
    const events: ImageCacheEvent[] = [{ name: "imageRequested" }];

    // run middeware stack and proxy first
    await next();

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
