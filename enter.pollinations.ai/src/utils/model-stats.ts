import type { KVNamespace } from "@cloudflare/workers-types";
import type { Logger } from "@logtape/logtape";

const TINYBIRD_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";
const CACHE_KEY = "model-stats";
const CACHE_TTL = 3600; // 1 hour

export type ModelStats = Record<string, { avg_price: number }>;

export async function getModelStats(
    kv: KVNamespace,
    log: Logger,
): Promise<ModelStats> {
    // Try cache first
    try {
        const cached = await kv.get(CACHE_KEY, "json");
        if (cached) {
            log.debug("Model stats cache hit");
            return cached as ModelStats;
        }
    } catch (e) {
        log.warn("Failed to read model stats from cache: {e}", { e });
    }

    // Fetch from Tinybird
    log.debug("Fetching model stats from Tinybird");
    try {
        const response = await fetch(TINYBIRD_MODEL_STATS_URL);
        if (!response.ok) {
            throw new Error(`Tinybird API error: ${response.status}`);
        }
        const data = (await response.json()) as {
            data?: Array<{ model: string; avg_cost_usd: number }>;
        };

        // Transform to lookup map
        const stats: ModelStats = {};
        for (const row of data.data || []) {
            stats[row.model] = { avg_price: row.avg_cost_usd };
        }

        // Cache result
        try {
            await kv.put(CACHE_KEY, JSON.stringify(stats), {
                expirationTtl: CACHE_TTL,
            });
            log.debug("Model stats cached successfully");
        } catch (e) {
            log.warn("Failed to cache model stats: {e}", { e });
        }

        return stats;
    } catch (e) {
        log.error("Failed to fetch model stats from Tinybird: {e}", { e });
        return {};
    }
}

export function getEstimatedPrice(
    stats: ModelStats,
    model: string | undefined,
): number {
    if (!model) return 0;
    return stats[model]?.avg_price || 0;
}
