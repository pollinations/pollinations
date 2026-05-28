import type { Logger } from "@logtape/logtape";
import { cached } from "../cache.ts";

const TINYBIRD_MODEL_STATS_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8&limit=200";
// v3: pipe now returns base model price (`dev_price`) instead of charged payer
// price (`total_price`), so old cached charged averages must be dropped.
const CACHE_KEY = "model-stats:v3";
const CACHE_TTL = 3600; // 1 hour

export type ModelStatsRow = {
    model: string;
    avg_base_price_pollen: number;
    request_count?: number;
    base_price_request_count?: number;
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

export function getEstimatedBasePrice(
    stats: TinybirdModelStats,
    model: string | undefined,
): number {
    if (!model) return 0;
    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_base_price_pollen ?? 0;
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
