import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

// Cache TTLs in seconds
const CACHE_TTL_HISTORICAL = 24 * 60 * 60; // 24 hours for historical data
const CACHE_TTL_TODAY = 5 * 60; // 5 minutes for today's data

type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    api_key_names: string[];
};

// Query params schema
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce.number().min(1).max(10000).optional().default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
});

// Daily usage query params
const usageDailyQuerySchema = z.object({
    since: z.string().optional(), // ISO date (e.g., 2024-01-01)
    until: z.string().optional(), // ISO date
});

export const usageRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: "Get your request history and spending data",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage");

            // Require authentication
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const { format, limit, before } = c.req.valid("query");

            log.debug(
                "Fetching usage: userId={userId} format={format} limit={limit} before={before}",
                {
                    userId: user.id,
                    format,
                    limit,
                    before,
                },
            );

            // Build Tinybird API URL from ingest URL origin
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdUrl = new URL(
                "/v0/pipes/user_usage.json",
                tinybirdOrigin,
            );
            tinybirdUrl.searchParams.set("user_id", user.id);
            tinybirdUrl.searchParams.set("limit", limit.toString());
            if (before) {
                tinybirdUrl.searchParams.set("before", before);
            }

            log.debug("Querying Tinybird: {url}", {
                url: tinybirdUrl.toString(),
            });

            try {
                const response = await fetch(tinybirdUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${c.env.TINYBIRD_READ_TOKEN}`,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    log.error(
                        "Tinybird error: url={url} status={status} error={error}",
                        {
                            url: tinybirdUrl.toString(),
                            status: response.status,
                            error: errorText,
                        },
                    );

                    // Return 503 if Service Unavailable or similar network issues, else 500
                    const status = response.status >= 500 ? 503 : 500;
                    return c.json(
                        {
                            error: "Failed to fetch usage data",
                            details:
                                response.status === 401
                                    ? "Unauthorized"
                                    : "Service Unavailable",
                        },
                        status,
                    );
                }

                const data = (await response.json()) as {
                    data: Array<{
                        timestamp: string;
                        type: string;
                        model: string | null;
                        api_key: string | null;
                        api_key_type: string | null;
                        meter_source: string | null;
                        input_text_tokens: number;
                        input_cached_tokens: number;
                        input_audio_tokens: number;
                        input_image_tokens: number;
                        output_text_tokens: number;
                        output_reasoning_tokens: number;
                        output_audio_tokens: number;
                        output_image_tokens: number;
                        cost_usd: number;
                        response_time_ms: number | null;
                    }>;
                };

                // Pass through directly - Tinybird returns clean format
                const usage = data.data;

                log.debug("Fetched {count} usage records", {
                    count: usage.length,
                });

                // Return CSV if requested
                if (format === "csv") {
                    const escapeCSV = (
                        val: string | number | boolean | null,
                    ) => {
                        if (val === null || val === undefined) return "";
                        const str = String(val);
                        if (
                            str.includes(",") ||
                            str.includes('"') ||
                            str.includes("\n")
                        ) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    };
                    const header =
                        "timestamp,type,model,api_key,api_key_type,meter_source,input_text_tokens,input_cached_tokens,input_audio_tokens,input_image_tokens,output_text_tokens,output_reasoning_tokens,output_audio_tokens,output_image_tokens,cost_usd,response_time_ms";
                    const rows = usage.map(
                        (row) =>
                            `${escapeCSV(row.timestamp)},${escapeCSV(row.type)},${escapeCSV(row.model)},${escapeCSV(row.api_key)},${escapeCSV(row.api_key_type)},${escapeCSV(row.meter_source)},${row.input_text_tokens},${row.input_cached_tokens},${row.input_audio_tokens},${row.input_image_tokens},${row.output_text_tokens},${row.output_reasoning_tokens},${row.output_audio_tokens},${row.output_image_tokens},${row.cost_usd},${row.response_time_ms || ""}`,
                    );
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json({
                    usage,
                    count: usage.length,
                });
            } catch (error) {
                log.error("Error fetching usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    );

// Helper: Get today's date string in UTC (YYYY-MM-DD)
function getTodayUTC(): string {
    return new Date().toISOString().split("T")[0];
}

// Helper: Fetch usage data from Tinybird for a date range
async function fetchTinybirdUsage(
    tinybirdOrigin: string,
    tinybirdToken: string,
    userId: string,
    since: string,
    until?: string,
): Promise<DailyUsageRecord[]> {
    const url = new URL("/v0/pipes/user_usage_daily.json", tinybirdOrigin);
    url.searchParams.set("user_id", userId);
    url.searchParams.set("since", since);
    if (until) {
        url.searchParams.set("until", until);
    }

    const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${tinybirdToken}` },
    });

    if (!response.ok) {
        throw new Error(`Tinybird error: ${response.status}`);
    }

    const data = (await response.json()) as { data: DailyUsageRecord[] };
    return data.data;
}

// Helper: Get cached data or fetch fresh
async function getCachedOrFetch(
    kv: KVNamespace,
    cacheKey: string,
    ttl: number,
    fetcher: () => Promise<DailyUsageRecord[]>,
    log?: Logger,
): Promise<{ data: DailyUsageRecord[]; cached: boolean }> {
    try {
        log?.trace("KV get: {key}", { key: cacheKey });
        const cached = await kv.get(cacheKey, "json");
        if (cached) {
            log?.trace("KV hit: {key}", { key: cacheKey });
            return { data: cached as DailyUsageRecord[], cached: true };
        }
        log?.trace("KV miss: {key}", { key: cacheKey });
    } catch (err) {
        log?.trace("KV get error: {key} {err}", { key: cacheKey, err });
    }

    const data = await fetcher();

    try {
        log?.trace("KV put: {key} ttl={ttl}", { key: cacheKey, ttl });
        await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: ttl });
    } catch (err) {
        log?.trace("KV put error: {key} {err}", { key: cacheKey, err });
    }

    return { data, cached: false };
}

// Daily aggregated usage endpoint with two-tier caching
export const usageDailyRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: "Get daily aggregated usage data",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", usageDailyQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage-daily");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const userId = user.id;

            // Calculate date boundaries (UTC)
            const now = new Date();
            const todayStr = getTodayUTC();
            const ninetyDaysAgo = new Date(
                now.getTime() - 90 * 24 * 60 * 60 * 1000,
            );
            const historicalSince = `${ninetyDaysAgo.toISOString().split("T")[0]} 00:00:00`;
            const historicalUntil = `${todayStr} 00:00:00`; // Up to but not including today
            const todaySince = `${todayStr} 00:00:00`;

            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = c.env.TINYBIRD_READ_TOKEN;
            const kv = c.env.KV;

            try {
                // Cache keys: historical keyed by yesterday's date (immutable), today keyed by 5-min bucket
                const fiveMinBucket = Math.floor(
                    now.getTime() / (5 * 60 * 1000),
                );
                const historicalCacheKey = `usage:daily:${userId}:historical:${todayStr}`;
                const todayCacheKey = `usage:daily:${userId}:today:${fiveMinBucket}`;

                // Fetch historical data (cached for 24h)
                const historicalResult = await getCachedOrFetch(
                    kv,
                    historicalCacheKey,
                    CACHE_TTL_HISTORICAL,
                    () =>
                        fetchTinybirdUsage(
                            tinybirdOrigin,
                            tinybirdToken,
                            userId,
                            historicalSince,
                            historicalUntil,
                        ),
                    log,
                );

                // Fetch today's data (cached for 5 min)
                const todayResult = await getCachedOrFetch(
                    kv,
                    todayCacheKey,
                    CACHE_TTL_TODAY,
                    () =>
                        fetchTinybirdUsage(
                            tinybirdOrigin,
                            tinybirdToken,
                            userId,
                            todaySince,
                        ),
                    log,
                );

                // Merge results
                const allUsage = [
                    ...historicalResult.data,
                    ...todayResult.data,
                ];

                log.debug(
                    "Fetched daily usage: historical={hCount} (cached={hCached}), today={tCount} (cached={tCached})",
                    {
                        hCount: historicalResult.data.length,
                        hCached: historicalResult.cached,
                        tCount: todayResult.data.length,
                        tCached: todayResult.cached,
                    },
                );

                return c.json({
                    usage: allUsage,
                    count: allUsage.length,
                });
            } catch (error) {
                log.error("Error fetching daily usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    );

export default usageRoutes;
