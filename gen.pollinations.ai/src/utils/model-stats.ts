import {
    getPriceDefinitionForModel,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

/**
 * Per-request estimate from the model definition, or null when the definition
 * is token-priced (Tinybird's historical average is the better preflight).
 *
 * Matches the catalog's flat-rate rule: an explicit `flatRate`, or an image
 * model with no prompt-token rate (per-image `completionImageTokens`).
 */
export function getDefinedRequestEstimate(
    definition: ModelDefinition,
): number | null {
    const isFlatRate =
        definition.flatRate ??
        (definition.category === "image" &&
            definition.cost.promptTextTokens === undefined);
    if (!isFlatRate) return null;

    const price = getPriceDefinitionForModel(definition);
    const requestPrice =
        price.completionImageTokens ??
        price.completionAudioSeconds ??
        price.completionVideoSeconds ??
        price.completionAudioTokens;
    return typeof requestPrice === "number" &&
        Number.isFinite(requestPrice) &&
        requestPrice >= 0
        ? requestPrice
        : null;
}

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
    definition?: ModelDefinition,
): number {
    if (definition) {
        const defined = getDefinedRequestEstimate(definition);
        if (defined != null) return defined;
    }
    if (!model) return 0;
    const row = stats.data?.find((r) => r.model === model);
    return row?.avg_cost_usd || 0;
}
