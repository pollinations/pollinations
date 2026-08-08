import {
    getPriceDefinitionForModel,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
    definition: ModelDefinition,
): number {
    if (!model) return 0;
    // Flat-rate models charge one fixed fee per generation, so the registry
    // price is the exact charge — no estimating needed. The Tinybird historical
    // average is only a fallback for usage-priced models, where the charge
    // can't be known before generating. Applying it to a flat-rate model can
    // overstate a cheap community endpoint by orders of magnitude and reject
    // the request with a false "insufficient balance".
    if (definition.flatRate) {
        return Object.values(getPriceDefinitionForModel(definition)).reduce(
            (total, price) => total + price,
            0,
        );
    }
    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_cost_usd || 0;
}
