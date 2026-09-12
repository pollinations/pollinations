// Shared model health, derived from the public Tinybird `model_health` pipe.
//
// One fetch and one cache serve both `/v1/models/status` (raw rows) and the
// model catalogs (a per-model summary), so the two can never disagree about
// whether a model is healthy.

import debug from "debug";
import { z } from "zod";

const log = debug("pollinations:model-health");

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_PUBLIC_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

export const CACHE_TTL_MS = 60_000;
export const DEFAULT_MINUTES = 60;
export const MAX_MINUTES = 7 * 24 * 60;
const MAX_CACHE_ENTRIES = 32;

// A summary older than this is reported as stale rather than silently trusted.
const STALE_AFTER_MS = 15 * 60_000;

// A model catalog must not wait on the monitoring backend. Past this budget the
// listing is served without health rather than held up for it.
const FETCH_TIMEOUT_MS = 2_500;

// Thresholds for the coarse `status` label. `reliable` needs both a high
// success rate and enough requests for that rate to mean anything.
export const RELIABLE_SUCCESS_RATE = 0.9;
export const RELIABLE_MIN_SAMPLE = 20;

export const ModelHealthRowSchema = z.object({
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

export const ModelHealthResponseSchema = z.object({
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

export type ModelHealthRow = z.infer<typeof ModelHealthRowSchema>;
export type ModelHealthResponse = z.infer<typeof ModelHealthResponseSchema>;

export const ModelHealthSummarySchema = z
    .object({
        status: z.enum(["reliable", "degraded", "unknown"]).meta({
            description:
                "`reliable` when the success rate and sample size both clear the thresholds, `degraded` when they do not, `unknown` when there is no data for this model in the window.",
        }),
        success_rate: z.number().min(0).max(1).nullable().meta({
            description:
                "Successful requests divided by attempts, where a fallback rescue counts as a success and caller-side 4xx failures are excluded. Null when unknown.",
        }),
        sample_size: z.number().int().nonnegative().meta({
            description: "Attempts observed in the window, 4xx excluded.",
        }),
        window_minutes: z.number().int().positive().meta({
            description: "Length of the rolling window the summary covers.",
        }),
        checked_at: z.string().nullable().meta({
            description: "When the underlying data was last fetched.",
        }),
        stale: z.boolean().meta({
            description:
                "True when the data is older than the freshness budget or was served from a fallback cache.",
        }),
    })
    .meta({ $id: "ModelHealthSummary" });

export type ModelHealthSummary = z.infer<typeof ModelHealthSummarySchema>;

export const UNKNOWN_HEALTH = (windowMinutes: number): ModelHealthSummary => ({
    status: "unknown",
    success_rate: null,
    sample_size: 0,
    window_minutes: windowMinutes,
    checked_at: null,
    stale: false,
});

type CacheEntry = { data: ModelHealthResponse; timestamp: number };

const cache = new Map<number, CacheEntry>();

function setCacheEntry(minutes: number, entry: CacheEntry) {
    cache.delete(minutes);
    cache.set(minutes, entry);
    if (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Test seam: drops the shared cache so cases cannot leak into each other. */
export function resetModelHealthCache() {
    cache.clear();
}

export function parseMinutes(value: string | undefined): number | null {
    if (value === undefined) return DEFAULT_MINUTES;
    if (!/^\d+$/.test(value)) return null;
    const minutes = Number(value);
    if (minutes < 1 || minutes > MAX_MINUTES) return null;
    return minutes;
}

export type HealthFetch = {
    data: ModelHealthResponse;
    timestamp: number;
    stale: boolean;
};

/**
 * Fetch the health rows for a window, serving a fresh cache hit when possible
 * and falling back to stale data rather than failing. Returns null only when
 * there is no data at all.
 */
export async function fetchModelHealth(
    minutes: number,
    fetchImpl: typeof fetch = fetch,
): Promise<HealthFetch | null> {
    const now = Date.now();
    const cached = cache.get(minutes);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        setCacheEntry(minutes, cached);
        return { data: cached.data, timestamp: cached.timestamp, stale: false };
    }

    try {
        const url = new URL("/v0/pipes/model_health.json", TINYBIRD_HOST);
        url.searchParams.set("token", TINYBIRD_PUBLIC_TOKEN);
        url.searchParams.set("minutes", String(minutes));
        const response = await fetchImpl(url.toString(), {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`Tinybird responded with ${response.status}`);
        }
        const data = (await response.json()) as ModelHealthResponse;
        const timestamp = Date.now();
        setCacheEntry(minutes, { data, timestamp });
        return { data, timestamp, stale: false };
    } catch (error) {
        log("Error fetching model health: %O", error);
        const stale = cache.get(minutes);
        if (!stale) return null;
        setCacheEntry(minutes, stale);
        return { data: stale.data, timestamp: stale.timestamp, stale: true };
    }
}

/**
 * Collapse the raw rows into one summary per model id.
 *
 * A model is served through several providers and event types, so its rows are
 * summed before any rate is computed -- a rate per row would let one quiet
 * provider outvote a busy one.
 */
export function summariseModelHealth(
    rows: ModelHealthRow[],
    {
        minutes,
        timestamp,
        stale,
    }: { minutes: number; timestamp: number; stale: boolean },
): Map<string, ModelHealthSummary> {
    const totals = new Map<string, { attempts: number; successes: number }>();

    for (const row of rows) {
        // 4xx is the caller getting it wrong; it says nothing about the model.
        const attempts = Math.max(0, row.total_requests - row.errors_4xx);
        if (attempts === 0) continue;
        // A request the fallback rescued still returned a usable result.
        const successes = Math.min(
            attempts,
            row.status_2xx + row.fallback_rescues,
        );
        const current = totals.get(row.model) ?? { attempts: 0, successes: 0 };
        current.attempts += attempts;
        current.successes += successes;
        totals.set(row.model, current);
    }

    const checkedAt = new Date(timestamp).toISOString();
    const isStale = stale || Date.now() - timestamp > STALE_AFTER_MS;

    const summaries = new Map<string, ModelHealthSummary>();
    for (const [model, { attempts, successes }] of totals) {
        const rate = successes / attempts;
        summaries.set(model, {
            status:
                rate >= RELIABLE_SUCCESS_RATE && attempts >= RELIABLE_MIN_SAMPLE
                    ? "reliable"
                    : "degraded",
            success_rate: Number(rate.toFixed(4)),
            sample_size: attempts,
            window_minutes: minutes,
            checked_at: checkedAt,
            stale: isStale,
        });
    }
    return summaries;
}

/** Health for every model in one call, or an empty map when data is missing. */
export async function getModelHealthSummaries(
    minutes: number = DEFAULT_MINUTES,
    fetchImpl: typeof fetch = fetch,
): Promise<Map<string, ModelHealthSummary>> {
    const result = await fetchModelHealth(minutes, fetchImpl);
    if (!result) return new Map();
    return summariseModelHealth(result.data.data, {
        minutes,
        timestamp: result.timestamp,
        stale: result.stale,
    });
}
