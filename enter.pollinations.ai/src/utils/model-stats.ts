/**
 * Utility for fetching and caching model statistics from Tinybird.
 * Used for estimating costs of in-flight requests.
 */

import type { Logger } from "@logtape/logtape";

// Public read-only token - only allows access to aggregated public statistics
const TINYBIRD_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";

const CACHE_KEY = "model-stats";
const CACHE_TTL = 3600; // 1 hour in seconds

export type ModelStat = {
    model: string;
    request_count: number;
    avg_cost_usd: number;
};

export type ModelStatsResponse = {
    data: ModelStat[];
};

/**
 * Get model statistics with KV caching.
 */
export async function getModelStats(
    kv: KVNamespace,
    log?: Logger,
): Promise<Map<string, ModelStat>> {
    try {
        // Try KV cache first
        const cached = await kv.get<ModelStatsResponse>(CACHE_KEY, "json");
        if (cached?.data) {
            return new Map(cached.data.map((stat) => [stat.model, stat]));
        }

        // Fetch from Tinybird
        const response = await fetch(TINYBIRD_URL);
        if (!response.ok) {
            log?.warn("Failed to fetch model stats from Tinybird: {status}", {
                status: response.status,
            });
            return new Map();
        }

        const data = (await response.json()) as ModelStatsResponse;

        // Cache the result
        await kv.put(CACHE_KEY, JSON.stringify(data), {
            expirationTtl: CACHE_TTL,
        });

        return new Map(data.data.map((stat) => [stat.model, stat]));
    } catch (error) {
        log?.error("Error fetching model stats: {error}", { error });
        return new Map();
    }
}

/**
 * Get estimated cost for a model based on historical average.
 * Returns 0 if no stats available - event will still be inserted and updated with actual cost.
 */
export function getEstimatedCost(
    modelStats: Map<string, ModelStat>,
    model: string,
): number {
    return modelStats.get(model)?.avg_cost_usd ?? 0;
}
