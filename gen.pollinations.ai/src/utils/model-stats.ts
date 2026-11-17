import {
    getPriceDefinitionForModel,
    isFlatRateModel,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import type { TinybirdModelStats } from "@shared/utils/model-stats.ts";

const REQUEST_PRICE_FIELDS = [
    "completionImageTokens",
    "completionAudioSeconds",
    "completionVideoSeconds",
    "completionAudioTokens",
] as const;

/**
 * Per-request estimate from the model definition, or null when the definition
 * is token-priced (Tinybird's historical average is the better preflight).
 * A rate with a declared unit gives the price of one unit, e.g. one megapixel.
 */
export function getDefinedRequestEstimate(
    definition: ModelDefinition,
): number | null {
    if (!isFlatRateModel(definition)) return null;

    const price = getPriceDefinitionForModel(definition);
    const field = REQUEST_PRICE_FIELDS.find((f) => price[f] != null);
    if (!field) return null;
    const requestPrice =
        (price[field] ?? 0) * (definition.priceUnits?.[field]?.quantity ?? 1);
    return Number.isFinite(requestPrice) && requestPrice >= 0
        ? requestPrice
        : null;
}

/**
 * Tinybird is the preflight source of truth when it looks like a real charge.
 * If it is missing or wildly above the defined per-request price, it is almost
 * certainly poisoned (mean of rows that billed output_tokens × a per-image
 * rate — e.g. 0.01 × ~3334 ≈ 33.34). Token-priced models have no per-request
 * definition, so they keep Tinybird as-is. A price per declared unit (one
 * megapixel) is only the fallback: a request can bill many units, so it never
 * discards Tinybird.
 */
const TINYBIRD_OUTLIER_RATIO = 10;

export function getEstimatedPrice(
    stats: TinybirdModelStats,
    model: string | undefined,
    definition?: ModelDefinition,
): number {
    if (!model) return 0;
    // Retain pre-rename history until Tinybird has data under the canonical ID.
    const tinybird =
        (
            stats.data?.find((r) => r.model === model) ??
            stats.data?.find((r) => definition?.aliases.includes(r.model))
        )?.avg_cost_usd || 0;
    const defined = definition ? getDefinedRequestEstimate(definition) : null;
    if (
        defined != null &&
        defined > 0 &&
        (tinybird <= 0 ||
            (!definition?.priceUnits &&
                tinybird > defined * TINYBIRD_OUTLIER_RATIO))
    ) {
        return defined;
    }
    return tinybird;
}
