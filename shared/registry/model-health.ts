import { z } from "zod";

export const MODEL_HEALTH_STATUSES = [
    "healthy",
    "degraded",
    "unavailable",
    "unknown",
] as const;

export type ModelHealthStatus = (typeof MODEL_HEALTH_STATUSES)[number];

export const ModelHealthSchema = z
    .object({
        status: z.enum(MODEL_HEALTH_STATUSES),
        success_rate: z.number().min(0).max(1).nullable(),
        sample_size: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
        checked_at: z.string().datetime().nullable(),
        stale: z.boolean(),
    })
    .meta({
        description:
            'Measured reliability from recent traffic, not a live probe. success_rate is final-response 2xx / (2xx + 5xx) over window_minutes; requests that failed on their own upstream but succeeded on a fallback count as successes, and caller-side errors (bad auth, no balance, invalid request) are excluded from the sample. status is "unknown" when sample_size is below the confidence threshold or no measurement could be taken, and is never reported as healthy in that case. checked_at is null and stale is true when no health data has ever been fetched.',
    });

export type ModelHealth = z.infer<typeof ModelHealthSchema>;

export type ModelHealthRow = {
    model: string;
    event_type: string;
    status_2xx: number;
    errors_5xx: number;
};

// A model's own upstream failures matter for reliability; the caller's 4xx
// errors (bad key, no balance, malformed request) don't, so they're excluded
// from the sample entirely rather than counted against the model. Mirrors
// operations/model-monitor's computeHealthStatus, minus its "no traffic reads
// healthy" default -- this feature must not imply 100% reliable from silence.
const MIN_SAMPLE_SIZE = 10;
const DEGRADED_FAILURE_PERCENT = 5;
const UNAVAILABLE_FAILURE_PERCENT = 20;

function statusFor(
    successRate: number | null,
    sampleSize: number,
): ModelHealthStatus {
    if (successRate === null || sampleSize < MIN_SAMPLE_SIZE) return "unknown";
    const failurePercent = (1 - successRate) * 100;
    if (failurePercent >= UNAVAILABLE_FAILURE_PERCENT) return "unavailable";
    if (failurePercent >= DEGRADED_FAILURE_PERCENT) return "degraded";
    return "healthy";
}

function checkedAtIso(checkedAt: number | null): string | null {
    return checkedAt !== null ? new Date(checkedAt).toISOString() : null;
}

export function unknownModelHealth(
    windowMinutes: number,
    checkedAt: number | null,
    stale: boolean,
): ModelHealth {
    return {
        status: "unknown",
        success_rate: null,
        sample_size: 0,
        window_minutes: windowMinutes,
        checked_at: checkedAtIso(checkedAt),
        stale,
    };
}

// Keyed on "model::event_type" so a name shared across categories (unlikely,
// but the health rows are grouped that way) never merges unrelated traffic.
export function buildModelHealthIndex(
    rows: readonly ModelHealthRow[],
    windowMinutes: number,
    checkedAt: number | null,
    stale: boolean,
): Map<string, ModelHealth> {
    const index = new Map<string, ModelHealth>();
    for (const row of rows) {
        const sampleSize = row.status_2xx + row.errors_5xx;
        const successRate = sampleSize > 0 ? row.status_2xx / sampleSize : null;
        index.set(`${row.model}::${row.event_type}`, {
            status: statusFor(successRate, sampleSize),
            success_rate: successRate,
            sample_size: sampleSize,
            window_minutes: windowMinutes,
            checked_at: checkedAtIso(checkedAt),
            stale,
        });
    }
    return index;
}
