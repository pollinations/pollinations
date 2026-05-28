import type { Logger } from "@logtape/logtape";
import { cached } from "../cache.ts";

const TINYBIRD_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8&limit=200";
// v2: pipe renamed `avg_cost_usd` → `pollen_avg_price`. Bump so cached v1
// payloads (which only have avg_cost_usd) don't render as undefined.
const CACHE_KEY = "model-stats:v2";
const CACHE_TTL = 3600; // 1 hour

export type ModelStatsRow = {
    model: string;
    pollen_avg_price: number;
    request_count?: number;
    priced_success_count?: number;
};

export type TinybirdModelStats = {
    data: ModelStatsRow[];
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
    return row?.pollen_avg_price ?? 0;
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
