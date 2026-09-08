import { z } from "zod";

// Host of the public Tinybird workspace; tests intercept fetches to it to
// serve canned model_health responses.
export const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";

// Raw row shape returned by the public Tinybird `model_health` pipe
// (enter.pollinations.ai/observability/endpoints/model_health.pipe). Kept here
// so the route handler and the catalog enrichment validate the same contract.
// Only `model` is required: every other column defaults so a partially-evolved
// pipe response still parses instead of failing model listings.
export const ModelHealthRowSchema = z.object({
    model: z.string(),
    event_type: z.string().default(""),
    provider: z.string().default(""),
    model_used: z.string().default(""),
    total_requests: z.number().int().nonnegative().default(0),
    status_2xx: z.number().int().nonnegative().default(0),
    errors_4xx: z.number().int().nonnegative().default(0),
    errors_5xx: z.number().int().nonnegative().default(0),
    own_calls: z.number().int().nonnegative().default(0),
    own_calls_ok: z.number().int().nonnegative().default(0),
    primary_5xx: z.number().int().nonnegative().default(0),
    primary_retried_503s: z.number().int().nonnegative().default(0),
    fallback_rescues: z.number().int().nonnegative().default(0),
    last_error_at: z.string().default(""),
    latency_p50_ms: z.number().nonnegative().nullable().default(null),
    latency_p95_ms: z.number().nonnegative().nullable().default(null),
    avg_latency_ms: z.number().nonnegative().nullable().default(null),
    last_request_at: z.string().default(""),
    tokens_per_second: z.number().nonnegative().nullable().default(null),
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

// Catalog-facing health summary. Mirrors the operations/model-monitor
// reliability read: 4xx (bad auth, no balance, invalid request, rate limits)
// is excluded from the sample entirely, and a request rescued by a fallback
// counts as a success because that is what the caller experienced.
export const ModelHealthSchema = z
    .object({
        // "healthy" | "degraded" | "unavailable" | "unknown". Unknown when the
        // sample is below the threshold or no data exists — never inferred
        // healthy from missing data. Experimental (alpha) status is a separate
        // registry field, not a health state.
        status: z.enum(["healthy", "degraded", "unavailable", "unknown"]),
        success_rate: z.number().min(0).max(1),
        sample_size: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
        checked_at: z.string().datetime(),
        stale: z.boolean(),
    })
    .meta({
        description:
            "Measured reliability over a rolling window. `success_rate` is final-response 2xx / (2xx + 5xx); caller errors (4xx) are excluded and fallback rescues count as successes. `status` is `unknown` when the sample is too small or no data exists.",
    });

export type ModelHealth = z.infer<typeof ModelHealthSchema>;

// Same thresholds as operations/model-monitor's computeHealthStatus:
// 5xx share >= 20% is unavailable, >= 5% is degraded, else healthy.
const DEGRADED_5XX_PERCENT = 5;
const UNAVAILABLE_5XX_PERCENT = 20;
// Below this many 2xx+5xx final responses the status reads as unknown: one
// flaky request is not enough to call a model degraded, and one success is
// not enough to call it healthy.
const MIN_SAMPLE_SIZE = 5;

export function computeModelHealth(
    row: ModelHealthRow,
    windowMinutes: number,
    checkedAt: string,
    stale: boolean,
): ModelHealth {
    const successes = row.status_2xx;
    const failures = row.errors_5xx;
    const sampleSize = successes + failures;
    const successRate = sampleSize > 0 ? successes / sampleSize : 0;

    let status: ModelHealth["status"] = "unknown";
    if (sampleSize >= MIN_SAMPLE_SIZE) {
        const pct5xx = (failures / sampleSize) * 100;
        if (pct5xx >= UNAVAILABLE_5XX_PERCENT) status = "unavailable";
        else if (pct5xx >= DEGRADED_5XX_PERCENT) status = "degraded";
        else status = "healthy";
    }

    return {
        status,
        success_rate: successRate,
        sample_size: sampleSize,
        window_minutes: windowMinutes,
        checked_at: checkedAt,
        stale,
    };
}

// The pipe groups by (model, event_type); the catalog is keyed by model id.
// Prefer text rows (the largest traffic class) so a model serving multiple
// event types reports one row instead of being listed twice.
export function latestHealthRowByModel(
    rows: ModelHealthRow[],
): Map<string, ModelHealthRow> {
    const byModel = new Map<string, ModelHealthRow>();
    for (const row of rows) {
        const existing = byModel.get(row.model);
        if (
            !existing ||
            (existing.event_type !== "generate.text" &&
                row.event_type === "generate.text")
        ) {
            byModel.set(row.model, row);
        }
    }
    return byModel;
}
