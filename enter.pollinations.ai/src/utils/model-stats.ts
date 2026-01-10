import { cached } from "@/cache";
import type { Logger } from "@logtape/logtape";

const TINYBIRD_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";
const CACHE_KEY = "model-stats";
const CACHE_TTL = 3600; // 1 hour

// Raw Tinybird response format - no transformation needed
export type TinybirdModelStats = {
    data: Array<{
        model: string;
        avg_cost_usd: number;
        request_count?: number;
    }>;
};

export async function getModelStats(
    kv: KVNamespace,
    log: Logger,
): Promise<TinybirdModelStats> {
    return await cached(fetchModelStats, {
        log,
        ttl: CACHE_TTL,
        kv,
        keyGenerator: () => CACHE_KEY,
    })(log);
}

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
): number {
    if (!model) return 0;
    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_cost_usd || 0;
}

async function fetchModelStats(log: Logger): Promise<TinybirdModelStats> {
    try {
        const response = await fetch(TINYBIRD_MODEL_STATS_URL);
        if (!response.ok) {
            throw new Error(`Tinybird API error: ${response.status}`);
        }
        return (await response.json()) as TinybirdModelStats;
    } catch (error) {
        log.error("Failed to fetch model stats from Tinybird: {error}", {
            error,
        });
        return { data: [] };
    }
}
