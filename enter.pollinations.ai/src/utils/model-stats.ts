import type { Logger } from "@logtape/logtape";

const TINYBIRD_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJiYzdkOTY4YS0wZmM1LTRmY2MtYWViNi0zZDQ0MWIwMGFlZjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.fhyEk0_6wt5a2RnM5tu4n_6nUfFdgN_YBMxg8VPv-Dw";
const CACHE_KEY = "model-stats";
const CACHE_TTL = 3600; // 1 hour

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
    // Try cache first
    const cached = (await kv.get(
        CACHE_KEY,
        "json",
    )) as TinybirdModelStats | null;
    if (cached) return cached;

    // Fetch from Tinybird
    try {
        const res = await fetch(TINYBIRD_URL);
        if (!res.ok) throw new Error(`Tinybird: ${res.status}`);
        const data = (await res.json()) as TinybirdModelStats;
        await kv.put(CACHE_KEY, JSON.stringify(data), {
            expirationTtl: CACHE_TTL,
        });
        return data;
    } catch (err) {
        log.error("Failed to fetch model stats: {err}", { err });
        return { data: [] };
    }
}

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model?: string,
): number {
    if (!model) return 0;
    return stats.data?.find((r) => r.model === model)?.avg_cost_usd || 0;
}
