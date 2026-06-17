import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
): number {
    if (!model) return 0;
    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_cost_usd || 0;
}
