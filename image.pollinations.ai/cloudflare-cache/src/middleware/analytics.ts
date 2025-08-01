import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";
import { createSimpleHash, extractPromptFromUrl } from "../util.ts";

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
} & Record<string, string | number>;

type ImageRequestedEvent = {
    name: "imageRequested";
    params: Record<string, string | number>;
};

type ImageServedFromCacheEvent = {
    name: "imageServedFromCache";
    cacheType: "exact" | "semantic";
    params: Record<string, string | number>;
};

type ImageGeneratedEvent = {
    name: "imageGenerated";
    params: Record<string, string | number>;
};

type ImageGenerationFailedEvent = {
    name: "imageGenerationFailed";
    params: Record<string, string | number>;
};

export type ImageCacheEvent =
    | ImageRequestedEvent
    | ImageServedFromCacheEvent
    | ImageGeneratedEvent
    | ImageGenerationFailedEvent;

type AnalyticsEvent = {
    name: string;
    params: Record<string, string | number>;
};

export const googleAnalytics = createMiddleware<Env>(async (c, next) => {
    // initialize analyticsEvents array
    c.set("analyticsEvents", []);

    await next();

    if (
        c.env.GA_MEASUREMENT_ID &&
        c.env.GA_API_SECRET &&
        c.var.analyticsEvents.length > 0
    ) {
        const config = {
            measurementId: c.env.GA_MEASUREMENT_ID,
            apiSecret: c.env.GA_API_SECRET,
        };
        const userId = await buildUserId(c);
        const events = c.var.analyticsEvents.map((event) => ({
            name: event.name,
            params: limitStringLength(
                buildAnalyticsParams(c, event),
                MAX_STRING_LENGTH,
            ),
        }));
        c.executionCtx.waitUntil(sendAnalytics(config, userId, events));
    }
    return null;
});

async function sendAnalytics(
    config: AnalyticsConfig,
    userId: string,
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
        userId,
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

    console.log(`[Analytics] Response for ${events.length} events:`, response);
}

function buildAnalyticsParams(
    c: Context<Env>,
    event: ImageCacheEvent,
): AnalyticsParams {
    const defaultParams = {
        model: "flux",
        width: 1024,
        height: 1024,
        seed: 42,
        negativePrompt: "worst quality, blurry",
        cacheStatus: "unknown",
    };

    const trackedHeaders = {
        referrer: c.req.header("referer") || c.req.header("referrer") || "",
        userAgent: c.req.header("user-agent") || "",
        language: c.req.header("accept-language") || "",
    };

    const originalPrompt = extractPromptFromUrl(new URL(c.req.url));

    return {
        ...defaultParams,
        ...trackedHeaders,
        cacheStatus: deriveCacheStatus(event),
        originalPrompt,
        ...event.params,
        ...(event.name === "imageServedFromCache"
            ? { cacheType: event.cacheType }
            : {}),
    };
}

function limitStringLength(
    params: Record<string, string | number>,
    maxLength: number,
): Record<string, string | number> {
    return Object.fromEntries(
        Object.entries(params).map(([key, value]) => {
            if (typeof value === "string") {
                return [key, value.substring(0, maxLength)];
            }
            return [key, value];
        }),
    );
}

async function buildUserId(c: Context<Env>): Promise<string> {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip");
    const userAgent = c.req.header("user-agent");
    return await createSimpleHash(`${ip.substring(0, 8)}${userAgent}`);
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
