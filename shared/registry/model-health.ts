import { z } from "zod";

export const ModelHealthSchema = z
    .object({
        status: z.enum(["on", "degraded", "off", "unknown"]),
        success_rate: z.number().min(0).max(1).nullable(),
        sample_size: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
        checked_at: z.string().datetime().nullable(),
        stale: z.boolean(),
    })
    .meta({
        description:
            "Recent final-response reliability. Caller-side 4xx errors are excluded; successful fallback rescues count as successes.",
    });

export type ModelHealth = z.infer<typeof ModelHealthSchema>;

const MIN_SAMPLE_SIZE = 10;
const DEGRADED_FAILURE_RATE = 0.05;
const OFF_FAILURE_RATE = 0.2;

export function modelHealthFromCounts(
    successes: number,
    failures: number,
    windowMinutes: number,
    checkedAt: number | null,
    stale: boolean,
): ModelHealth {
    const sampleSize = successes + failures;
    const successRate = sampleSize ? successes / sampleSize : null;
    const failureRate = sampleSize ? failures / sampleSize : null;
    let status: ModelHealth["status"] = "unknown";

    if (sampleSize >= MIN_SAMPLE_SIZE && failureRate !== null) {
        status =
            failureRate >= OFF_FAILURE_RATE
                ? "off"
                : failureRate >= DEGRADED_FAILURE_RATE
                  ? "degraded"
                  : "on";
    }

    return {
        status,
        success_rate: successRate,
        sample_size: sampleSize,
        window_minutes: windowMinutes,
        checked_at:
            checkedAt === null ? null : new Date(checkedAt).toISOString(),
        stale,
    };
}
