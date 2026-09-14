import { errorResponseDescriptions } from "@shared/utils/api-docs.ts";
import debug from "debug";
import type { Context } from "hono";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";

const log = debug("pollinations:model-status");

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 32;
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 7 * 24 * 60;
const DATA_TIMESTAMP_HEADER = "X-Model-Status-Timestamp";
const STALE_HEADER = "X-Model-Status-Stale";

const ModelHealthRowSchema = z.object({
    model: z.string(),
    event_type: z.string(),
    provider: z.string(),
    model_used: z.string(),
    total_requests: z.number().int().nonnegative(),
    status_2xx: z.number().int().nonnegative(),
    errors_4xx: z.number().int().nonnegative(),
    errors_5xx: z.number().int().nonnegative(),
    own_calls: z.number().int().nonnegative(),
    own_calls_ok: z.number().int().nonnegative(),
    primary_5xx: z.number().int().nonnegative(),
    primary_retried_503s: z.number().int().nonnegative(),
    fallback_rescues: z.number().int().nonnegative(),
    last_error_at: z.string(),
    latency_p50_ms: z.number().nonnegative().nullable(),
    latency_p95_ms: z.number().nonnegative().nullable(),
    avg_latency_ms: z.number().nonnegative().nullable(),
    last_request_at: z.string(),
    tokens_per_second: z.number().nonnegative().nullable(),
});

const ModelHealthResponseSchema = z.object({
    data: z.array(ModelHealthRowSchema),
    meta: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
    rows: z.number().int().nonnegative().optional(),
    statistics: z
        .object({
            elapsed: z.number().nonnegative(),
            rows_read: z.number().int().nonnegative(),
            bytes_read: z.number().int().nonnegative(),
        })
        .optional(),
});

type ModelHealthResponse = z.infer<typeof ModelHealthResponseSchema>;

// One row per route actually called for a public model: the primary and
// every fallback it has fallen through to, each with its own health.
// Columns intentionally mirror ModelHealthRowSchema (status_2xx, errors_5xx,
// latency_p50_ms, ...) so the monitor's computeHealthStatus and formatters
// work unchanged against a route row.
const ModelRouteHealthRowSchema = z.object({
    model: z.string(),
    event_type: z.string(),
    provider: z.string(),
    model_used: z.string(),
    // 1 on a model's rollup row, 0 on a single route. ClickHouse returns
    // GROUPING() and Bool aggregates as 0/1 rather than JSON booleans.
    is_rollup: z.union([z.boolean(), z.number()]),
    fallback_used: z.union([z.boolean(), z.number()]),
    total_requests: z.number().int().nonnegative(),
    status_2xx: z.number().int().nonnegative(),
    errors_4xx: z.number().int().nonnegative(),
    errors_5xx: z.number().int().nonnegative(),
    served: z.number().int().nonnegative(),
    fallback_rescues: z.number().int().nonnegative(),
    retried_503s: z.number().int().nonnegative(),
    last_error_at: z.string(),
    latency_p50_ms: z.number().nonnegative().nullable(),
    latency_p95_ms: z.number().nonnegative().nullable(),
    avg_latency_ms: z.number().nonnegative().nullable(),
    last_request_at: z.string(),
    tokens_per_second: z.number().nonnegative().nullable(),
});

const ModelRouteHealthResponseSchema = z.object({
    data: z.array(ModelRouteHealthRowSchema),
    meta: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
    rows: z.number().int().nonnegative().optional(),
    statistics: z
        .object({
            elapsed: z.number().nonnegative(),
            rows_read: z.number().int().nonnegative(),
            bytes_read: z.number().int().nonnegative(),
        })
        .optional(),
});

type ModelRouteHealthResponse = z.infer<typeof ModelRouteHealthResponseSchema>;

type CacheEntry<T> = { data: T; timestamp: number };

/** Local/staging targeting. Unset in production, where the constants apply. */
type TinybirdOverrides = {
    host?: string;
    token?: string;
    deployment?: string;
};

function parseMinutes(value: string | undefined): number | null {
    if (value === undefined) return DEFAULT_MINUTES;
    if (!/^\d+$/.test(value)) return null;

    const minutes = Number(value);
    if (minutes < 1 || minutes > MAX_MINUTES) return null;
    return minutes;
}

/**
 * A cached, stale-tolerant fetcher for a single Tinybird pipe.
 *
 * `/v1/models/status` and `/v1/models/status/routes` are otherwise
 * identical: same host, same public token, same `minutes` contract, same
 * "serve stale on upstream failure" behavior. Only the pipe name and the
 * cache namespace differ, so both routes share this rather than each
 * re-implementing caching and stale-cache fallback.
 */
function createTinybirdPipeFetcher<T>(pipeName: string) {
    const cache = new Map<number, CacheEntry<T>>();

    function setCacheEntry(minutes: number, entry: CacheEntry<T>) {
        cache.delete(minutes);
        cache.set(minutes, entry);

        if (cache.size > MAX_CACHE_ENTRIES) {
            const oldestMinutes = cache.keys().next().value;
            if (oldestMinutes !== undefined) cache.delete(oldestMinutes);
        }
    }

    async function fetchFresh(
        minutes: number,
        overrides?: TinybirdOverrides,
    ): Promise<T> {
        const url = new URL(
            `/v0/pipes/${pipeName}.json`,
            overrides?.host || TINYBIRD_HOST,
        );
        url.searchParams.set(
            "token",
            overrides?.token || TINYBIRD_PUBLIC_TOKEN,
        );
        url.searchParams.set("minutes", String(minutes));
        // Lets a non-promoted Tinybird deployment be targeted locally, which is
        // the only way to exercise this route against staging before promote.
        if (overrides?.deployment) {
            url.searchParams.set("__tb__deployment", overrides.deployment);
        }
        log("Fetching %s from Tinybird: %s", pipeName, url.toString());

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Tinybird responded with ${response.status}`);
        }
        return (await response.json()) as T;
    }

    return async function fetchWithCache(
        minutes: number,
        overrides?: TinybirdOverrides,
    ): Promise<{ data: T; timestamp: number; stale: boolean }> {
        const now = Date.now();
        const cached = cache.get(minutes);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            log(
                "Returning cached %s response for %d minutes",
                pipeName,
                minutes,
            );
            setCacheEntry(minutes, cached);
            return {
                data: cached.data,
                timestamp: cached.timestamp,
                stale: false,
            };
        }

        try {
            const data = await fetchFresh(minutes, overrides);
            const timestamp = Date.now();
            setCacheEntry(minutes, { data, timestamp });
            return { data, timestamp, stale: false };
        } catch (error) {
            log("Error fetching %s: %O", pipeName, error);
            const stale = cache.get(minutes);
            if (stale) {
                log(
                    "Falling back to stale %s cache for %d minutes",
                    pipeName,
                    minutes,
                );
                setCacheEntry(minutes, stale);
                return {
                    data: stale.data,
                    timestamp: stale.timestamp,
                    stale: true,
                };
            }
            throw error;
        }
    };
}

const fetchModelHealth =
    createTinybirdPipeFetcher<ModelHealthResponse>("model_health");
const fetchModelRouteHealth =
    createTinybirdPipeFetcher<ModelRouteHealthResponse>("model_route_health");

/** Only set for local and staging runs; absent in production. */
type TinybirdQueryEnv = {
    TINYBIRD_QUERY_HOST?: string;
    TINYBIRD_QUERY_TOKEN?: string;
    TINYBIRD_QUERY_DEPLOYMENT?: string;
};

function tinybirdOverrides(c: Context<Env>): TinybirdOverrides {
    // Through unknown: the bindings carry namespaces and databases too, so
    // they do not overlap a bag of optional strings.
    const env = c.env as unknown as TinybirdQueryEnv;
    return {
        host: env.TINYBIRD_QUERY_HOST,
        token: env.TINYBIRD_QUERY_TOKEN,
        deployment: env.TINYBIRD_QUERY_DEPLOYMENT,
    };
}

function parseMinutesOrRespond(c: Context<Env>) {
    const format = c.req.query("format");
    if (format !== undefined && format !== "raw") {
        return {
            error: c.json(
                {
                    error: "format must be raw or omitted; this endpoint returns the raw Tinybird response",
                },
                400,
            ),
        } as const;
    }

    const minutes = parseMinutes(c.req.query("minutes"));
    if (minutes === null) {
        return {
            error: c.json(
                {
                    error: `minutes must be an integer between 1 and ${MAX_MINUTES}`,
                },
                400,
            ),
        } as const;
    }

    return { minutes } as const;
}

const minutesParameter = {
    name: "minutes",
    in: "query" as const,
    required: false,
    description: `Rolling window in minutes (default ${DEFAULT_MINUTES}, maximum ${MAX_MINUTES}).`,
    schema: {
        type: "integer" as const,
        minimum: 1,
        maximum: MAX_MINUTES,
        default: DEFAULT_MINUTES,
    },
};

const formatParameter = {
    name: "format",
    in: "query" as const,
    required: false,
    description: "Optional compatibility parameter. Only `raw` is accepted.",
    schema: { type: "string" as const, enum: ["raw"] },
};

export const modelStatusRoutes = new Hono<Env>()
    .get(
        "/v1/models/status",
        describeRoute({
            tags: ["📊 Monitor"],
            summary: "Model Health Status",
            description: [
                "Returns raw model health rows from the public Tinybird `model_health` pipe.",
                "",
                "Each row is one (model, event_type): `model_used`/`provider` name whichever route served most of its traffic, so a model rescued by a fallback on every request can still read as healthy here. Use `/v1/models/status/routes` to see each route — primary and fallbacks — separately.",
                "",
                "The optional `minutes` query parameter controls the rolling window and must be an integer between 1 and 10080.",
                `The ${DATA_TIMESTAMP_HEADER} response header reports when the data was fetched from Tinybird; ${STALE_HEADER} is set when stale data is returned during an upstream failure.`,
            ].join("\n"),
            parameters: [minutesParameter, formatParameter],
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(ModelHealthResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 502),
            },
        }),
        async (c) => {
            const parsed = parseMinutesOrRespond(c);
            if ("error" in parsed) return parsed.error;

            try {
                const { data, timestamp, stale } = await fetchModelHealth(
                    parsed.minutes,
                    tinybirdOverrides(c),
                );
                c.header(
                    DATA_TIMESTAMP_HEADER,
                    new Date(timestamp).toISOString(),
                );
                if (stale) c.header(STALE_HEADER, "true");
                return c.json(data);
            } catch {
                return c.json(
                    { error: "Failed to fetch model health data" },
                    502,
                );
            }
        },
    )
    .get(
        "/v1/models/status/routes",
        describeRoute({
            tags: ["📊 Monitor"],
            summary: "Model Route Health Status",
            description: [
                "Returns raw per-route health rows from the public Tinybird `model_route_health` pipe.",
                "",
                "Returns two grains. A row with `is_rollup` 1 is a model total across all of its routes and carries no `model_used`/`provider`; a row with `is_rollup` 0 is a single execution route — the model's own primary, or a fallback it fell through to.",
                "",
                "Both count every upstream call, not just the one that settled the request, so a model rescued by a fallback scores below what `/v1/models/status` reports for it: that endpoint counts the caller's outcome, this one counts the infrastructure's. `served` on a route is how many calls it settled, and summing that across a model's routes gives the request count `/v1/models/status` reports.",
                "",
                "Routes that have never fired have no row here; this reflects observed traffic only, not the configured fallback list.",
                "",
                "The optional `minutes` query parameter controls the rolling window and must be an integer between 1 and 10080.",
                `The ${DATA_TIMESTAMP_HEADER} response header reports when the data was fetched from Tinybird; ${STALE_HEADER} is set when stale data is returned during an upstream failure.`,
            ].join("\n"),
            parameters: [minutesParameter, formatParameter],
            responses: {
                200: {
                    description: "Success",
                    content: {
                        "application/json": {
                            schema: resolver(ModelRouteHealthResponseSchema),
                        },
                    },
                },
                ...errorResponseDescriptions(400, 502),
            },
        }),
        async (c) => {
            const parsed = parseMinutesOrRespond(c);
            if ("error" in parsed) return parsed.error;

            try {
                const { data, timestamp, stale } = await fetchModelRouteHealth(
                    parsed.minutes,
                    tinybirdOverrides(c),
                );
                c.header(
                    DATA_TIMESTAMP_HEADER,
                    new Date(timestamp).toISOString(),
                );
                if (stale) c.header(STALE_HEADER, "true");
                return c.json(data);
            } catch {
                return c.json(
                    { error: "Failed to fetch model route health data" },
                    502,
                );
            }
        },
    );
