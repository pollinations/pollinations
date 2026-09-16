import { z } from "zod";

export const ModelHealthSchema = z
    .object({
        status: z.enum(["healthy", "degraded", "down", "unknown"]).meta({
            description:
                "Based on the reported window: healthy above 95% success, degraded above 80% through 95%, down at 80% or below, unknown below 10 measured requests or when health data is unavailable.",
        }),
        success_rate: z.number().min(0).max(1).nullable().meta({
            description:
                "Successful requests / measured requests (0–1); null with no samples.",
        }),
        sample_size: z.number().int().nonnegative(),
        window_minutes: z.number().int().positive(),
    })
    .meta({
        description:
            "Recent gateway final-response reliability. Final 4xx responses are excluded; successful fallback rescues count as successes. Not individual upstream health.",
    });

export type ModelHealth = z.infer<typeof ModelHealthSchema>;

const MIN_SAMPLE_SIZE = 10;
const DEGRADED_FAILURE_RATE = 0.05;
const DOWN_FAILURE_RATE = 0.2;

export function modelHealthFromCounts(
    successes: number,
    failures: number,
    windowMinutes: number,
): ModelHealth {
    const sampleSize = successes + failures;
    const successRate = sampleSize ? successes / sampleSize : null;
    const failureRate = sampleSize ? failures / sampleSize : null;
    let status: ModelHealth["status"] = "unknown";

    if (sampleSize >= MIN_SAMPLE_SIZE && failureRate !== null) {
        status =
            failureRate >= DOWN_FAILURE_RATE
                ? "down"
                : failureRate >= DEGRADED_FAILURE_RATE
                  ? "degraded"
                  : "healthy";
    }

    return {
        status,
        success_rate: successRate,
        sample_size: sampleSize,
        window_minutes: windowMinutes,
    };
}
