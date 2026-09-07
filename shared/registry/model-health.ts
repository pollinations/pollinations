import { z } from "zod";

export const ModelHealthStatusSchema = z.enum([
    "healthy",
    "degraded",
    "unavailable",
    "unknown",
]);

export type ModelHealthStatus = z.infer<typeof ModelHealthStatusSchema>;

export const ModelHealthSchema = z.object({
    status: ModelHealthStatusSchema,
    success_rate: z.number().min(0).max(1).nullable(),
    sample_size: z.number().int().nonnegative(),
    window_minutes: z.number().int().positive(),
    checked_at: z.string().datetime(),
    stale: z.boolean(),
});

export type ModelHealth = z.infer<typeof ModelHealthSchema>;

// Minimum 2xx+5xx sample before a model is classified as anything other than
// "unknown". A low-traffic model with a handful of requests must not flip to
// "unavailable" on a tiny, noisy sample.
export const MIN_SAMPLE_SIZE = 30;

// Success-rate thresholds. Sample is 2xx / (2xx + 5xx); 4xx (bad auth, no
// balance, invalid request, rate limits) reflects caller behaviour rather than
// model reliability, so it is excluded from the denominator entirely.
const HEALTHY_SUCCESS_RATE = 0.99;
const DEGRADED_SUCCESS_RATE = 0.9;

export interface ModelHealthRow {
    model: string;
    status_2xx: number;
    errors_5xx: number;
}

export interface ModelHealthWindow {
    windowMinutes: number;
    checkedAt: number;
    stale: boolean;
}

function sampleSizeFor(
    row: Pick<ModelHealthRow, "status_2xx" | "errors_5xx">,
): number {
    return row.status_2xx + row.errors_5xx;
}

export function successRateForRow(
    row: Pick<ModelHealthRow, "status_2xx" | "errors_5xx">,
): number | null {
    const sampleSize = sampleSizeFor(row);
    if (sampleSize === 0) return null;
    return row.status_2xx / sampleSize;
}

export function statusForRow(
    row: Pick<ModelHealthRow, "status_2xx" | "errors_5xx">,
): ModelHealthStatus {
    const sampleSize = sampleSizeFor(row);
    if (sampleSize < MIN_SAMPLE_SIZE) return "unknown";
    const successRate = row.status_2xx / sampleSize;
    if (successRate >= HEALTHY_SUCCESS_RATE) return "healthy";
    if (successRate >= DEGRADED_SUCCESS_RATE) return "degraded";
    return "unavailable";
}

export function computeModelHealth(
    row: ModelHealthRow,
    window: ModelHealthWindow,
): ModelHealth {
    return {
        status: statusForRow(row),
        success_rate: successRateForRow(row),
        sample_size: sampleSizeFor(row),
        window_minutes: window.windowMinutes,
        checked_at: new Date(window.checkedAt).toISOString(),
        stale: window.stale,
    };
}

export function unknownModelHealth(window: ModelHealthWindow): ModelHealth {
    return {
        status: "unknown",
        success_rate: null,
        sample_size: 0,
        window_minutes: window.windowMinutes,
        checked_at: new Date(window.checkedAt).toISOString(),
        stale: window.stale,
    };
}
