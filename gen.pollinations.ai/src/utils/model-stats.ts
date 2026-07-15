import { resolveModelNameSafe } from "@shared/registry/registry.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
): number {
    if (!model) return 0;
    const exactRow = stats.data?.find((candidate) => candidate.model === model);
    if (exactRow) return exactRow.avg_cost_usd || 0;

    const resolvedModel = resolveModelNameSafe(model);
    const row = stats.data?.find(
        (candidate) => resolveModelNameSafe(candidate.model) === resolvedModel,
    );
    return row?.avg_cost_usd || 0;
}
