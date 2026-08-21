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

/**
 * Tinybird is the preflight source of truth when it looks like a real charge.
 * If it is missing or wildly above the defined per-request price, it is almost
 * certainly poisoned (mean of rows that billed output_tokens × a per-image
 * rate — e.g. 0.01 × ~3334 ≈ 33.34). Token-priced models have no per-request
 * definition, so they keep Tinybird as-is.
 */
const TINYBIRD_OUTLIER_RATIO = 10;

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
    definition?: ModelDefinition,
): number {
    if (!model) return 0;
    const tinybird =
        stats.data?.find((r) => r.model === model)?.avg_cost_usd || 0;
    const defined = definition ? getDefinedRequestEstimate(definition) : null;
    if (
        defined != null &&
        defined > 0 &&
        (tinybird <= 0 || tinybird > defined * TINYBIRD_OUTLIER_RATIO)
    ) {
        return defined;
    }
    return tinybird;
}
