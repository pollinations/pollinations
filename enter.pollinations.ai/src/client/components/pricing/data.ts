/**
 * Data fetching and transformation for pricing
 */

import { IMAGE_SERVICES } from "../../../../../shared/registry/image.ts";
import type { CostDefinition } from "../../../../../shared/registry/registry.ts";
import { TEXT_SERVICES } from "../../../../../shared/registry/text.ts";
import {
    formatPrice,
    formatPricePer1M,
    formatPricePerImage,
} from "./formatters.ts";
import type { ModelPrice } from "./types.ts";

export const getModelPrices = (): ModelPrice[] => {
    const prices: ModelPrice[] = [];

    // Add text models
    for (const [serviceName, serviceConfig] of Object.entries(TEXT_SERVICES)) {
        const costHistory = serviceConfig.cost;
        if (!costHistory) continue;

        const latestCost: CostDefinition = costHistory[0];

        prices.push({
            name: serviceName,
            type: "text",
            perToken: true,
            promptTextPrice: formatPrice(
                latestCost.promptTextTokens,
                formatPricePer1M,
            ),
            promptCachedPrice: formatPrice(
                latestCost.promptCachedTokens,
                formatPricePer1M,
            ),
            promptAudioPrice: formatPrice(
                latestCost.promptAudioTokens,
                formatPricePer1M,
            ),
            completionTextPrice: formatPrice(
                latestCost.completionTextTokens,
                formatPricePer1M,
            ),
            completionAudioPrice: formatPrice(
                latestCost.completionAudioTokens,
                formatPricePer1M,
            ),
            completionAudioTokens: formatPrice(
                latestCost.completionAudioTokens,
                formatPricePer1M,
            ),
        });
    }

    // Add image models
    for (const [serviceName, serviceConfig] of Object.entries(IMAGE_SERVICES)) {
        const costHistory = serviceConfig.cost;
        if (!costHistory) continue;

        const latestCost: CostDefinition = costHistory[0];

        // Auto-detect token-based pricing: models with promptTextTokens or promptImageTokens
        const isTokenBased =
            latestCost.promptTextTokens !== undefined ||
            latestCost.promptImageTokens !== undefined;

        if (isTokenBased) {
            // Token-based pricing (e.g., gptimage, nanobanana)
            prices.push({
                name: serviceName,
                type: "image",
                perToken: true,
                promptTextPrice: formatPrice(
                    latestCost.promptTextTokens,
                    formatPricePer1M,
                ),
                promptImagePrice: formatPrice(
                    latestCost.promptImageTokens,
                    formatPricePer1M,
                ),
                completionImagePrice: formatPrice(
                    latestCost.completionImageTokens,
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
                    latestCost.completionImageTokens,
                    formatPricePerImage,
                ),
            });
        }
    }

    return prices;
};
