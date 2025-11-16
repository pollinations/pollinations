/**
 * Data fetching and transformation for pricing
 */

import {
    TEXT_COSTS,
    TEXT_SERVICES,
} from "../../../../../shared/registry/text.ts";
import {
    IMAGE_COSTS,
    IMAGE_SERVICES,
} from "../../../../../shared/registry/image.ts";
import type { ModelPrice } from "./types.ts";
import {
    formatPrice,
    formatPricePer1M,
    formatPricePerImage,
} from "./formatters.ts";

export const getModelPrices = (): ModelPrice[] => {
    const prices: ModelPrice[] = [];

    // Add text models
    for (const [serviceName, serviceConfig] of Object.entries(TEXT_SERVICES)) {
        const modelId = serviceConfig.modelId;
        const costHistory = TEXT_COSTS[modelId as keyof typeof TEXT_COSTS];
        if (!costHistory) continue;

        const latestCost = costHistory[0];
        if (!latestCost) continue;

        const latestCostAny = latestCost as any;

        prices.push({
            name: serviceName,
            type: "text",
            perToken: true,
            promptTextPrice: formatPrice(
                latestCostAny.promptTextTokens,
                formatPricePer1M,
            ),
            promptCachedPrice: formatPrice(
                latestCostAny.promptCachedTokens,
                formatPricePer1M,
            ),
            promptAudioPrice: formatPrice(
                latestCostAny.promptAudioTokens,
                formatPricePer1M,
            ),
            completionTextPrice: formatPrice(
                latestCostAny.completionTextTokens,
                formatPricePer1M,
            ),
            completionAudioPrice: formatPrice(
                latestCostAny.completionAudioTokens,
                formatPricePer1M,
            ),
            completionAudioTokens: formatPrice(
                latestCostAny.completionAudioTokens,
                formatPricePer1M,
            ),
        });
    }

    // Add image models
    for (const [serviceName, serviceConfig] of Object.entries(IMAGE_SERVICES)) {
        const modelId = serviceConfig.modelId;
        const costHistory = IMAGE_COSTS[modelId as keyof typeof IMAGE_COSTS];
        if (!costHistory) continue;

        const latestCost = costHistory[0];
        if (!latestCost) continue;

        const costAny = latestCost as any;

        // Auto-detect token-based pricing: models with promptTextTokens or promptImageTokens
        // This aligns with the unified image token tracking (see commit cc058f3)
        const isTokenBased =
            costAny.promptTextTokens !== undefined ||
            costAny.promptImageTokens !== undefined;

        if (isTokenBased) {
            // Token-based pricing (e.g., gptimage, nanobanana)
            prices.push({
                name: serviceName,
                type: "image",
                perToken: true,
                promptTextPrice: formatPrice(
                    costAny.promptTextTokens,
                    formatPricePer1M,
                ),
                promptImagePrice: formatPrice(
                    costAny.promptImageTokens,
                    formatPricePer1M,
                ),
                completionImagePrice: formatPrice(
                    costAny.completionImageTokens,
                    formatPricePer1M,
                ),
            });
        } else {
            // Per-image pricing (e.g., flux, turbo, kontext, seedream)
            prices.push({
                name: serviceName,
                type: "image",
                perToken: false,
                perImagePrice: formatPrice(
                    costAny.completionImageTokens,
                    formatPricePerImage,
                ),
            });
        }
    }

    return prices;
};
