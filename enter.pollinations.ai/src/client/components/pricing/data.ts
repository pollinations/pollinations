/**
 * Data fetching and transformation for pricing
 */

import { AUDIO_SERVICES } from "../../../../../shared/registry/audio.ts";
import { IMAGE_SERVICES } from "../../../../../shared/registry/image.ts";
import {
    getActivePriceDefinition,
    type ModelName,
    type PriceDefinition,
} from "../../../../../shared/registry/registry.ts";
import { TEXT_SERVICES } from "../../../../../shared/registry/text.ts";
import {
    formatPrice,
    formatPricePer1M,
    formatPricePerImage,
} from "./formatters.ts";
import type { ModelPrice } from "./types.ts";
import type { ModelStats } from "./use-model-stats.ts";

// Display-only conversion for char-billed TTS. Billing remains character-based
// in the registry; the pricing UI shows an estimated audio-second equivalent.
const ESTIMATED_TTS_CHARS_PER_SECOND = 15;

const formatEstimatedTtsPricePerSecond = (pricePerChar: number): string => {
    const pricePerSecond = pricePerChar * ESTIMATED_TTS_CHARS_PER_SECOND;
    return pricePerSecond < 0.001
        ? pricePerSecond.toFixed(5)
        : pricePerSecond.toFixed(4);
};

export const getModelPrices = (modelStats?: ModelStats): ModelPrice[] => {
    const prices: ModelPrice[] = [];

    // Add text models
    for (const [serviceName, serviceConfig] of Object.entries(TEXT_SERVICES)) {
        if ("hidden" in serviceConfig && serviceConfig.hidden) continue;
        const latestPrice = getActivePriceDefinition(
            serviceName as ModelName,
        ) as PriceDefinition | null;
        if (!latestPrice) continue;

        prices.push({
            name: serviceName,
            type: serviceConfig.category,
            perToken: true,
            promptTextPrice: formatPrice(
                latestPrice.promptTextTokens,
                formatPricePer1M,
            ),
            promptCachedPrice: formatPrice(
                latestPrice.promptCachedTokens,
                formatPricePer1M,
            ),
            promptAudioPrice: formatPrice(
                latestPrice.promptAudioTokens,
                formatPricePer1M,
            ),
            completionTextPrice: formatPrice(
                latestPrice.completionTextTokens,
                formatPricePer1M,
            ),
            completionAudioPrice: formatPrice(
                latestPrice.completionAudioTokens,
                formatPricePer1M,
            ),
            completionAudioTokens: formatPrice(
                latestPrice.completionAudioTokens,
                formatPricePer1M,
            ),
        });
    }

    // Add image/video models
    for (const [serviceName, serviceConfig] of Object.entries(IMAGE_SERVICES)) {
        if ("hidden" in serviceConfig && serviceConfig.hidden) continue;
        const latestPrice = getActivePriceDefinition(
            serviceName as ModelName,
        ) as PriceDefinition | null;
        if (!latestPrice) continue;

        if (serviceConfig.category === "video") {
            // Check if it's token-based (seedance) or second-based (veo)
            if (latestPrice.completionVideoTokens) {
                prices.push({
                    name: serviceName,
                    type: serviceConfig.category,
                    perToken: true,
                    perTokenPrice: formatPrice(
                        latestPrice.completionVideoTokens,
                        formatPricePer1M,
                    ),
                });
            } else {
                prices.push({
                    name: serviceName,
                    type: serviceConfig.category,
                    perToken: false,
                    perSecondPrice: formatPrice(
                        latestPrice.completionVideoSeconds,
                        (v: number) => v.toFixed(3),
                    ),
                    perAudioSecondPrice: formatPrice(
                        latestPrice.completionAudioSeconds,
                        (v: number) => v.toFixed(3),
                    ),
                });
            }
        } else if (
            latestPrice.promptTextTokens ||
            latestPrice.promptImageTokens
        ) {
            // Token-based image pricing (e.g., gptimage, nanobanana)
            prices.push({
                name: serviceName,
                type: serviceConfig.category,
                perToken: true,
                promptTextPrice: formatPrice(
                    latestPrice.promptTextTokens,
                    formatPricePer1M,
                ),
                promptImagePrice: formatPrice(
                    latestPrice.promptImageTokens,
                    formatPricePer1M,
                ),
                completionImagePrice: formatPrice(
                    latestPrice.completionImageTokens,
                    formatPricePer1M,
                ),
            });
        } else {
            // Per-image pricing (e.g., flux, turbo, kontext, seedream)
            prices.push({
                name: serviceName,
                type: serviceConfig.category,
                perToken: false,
                perImagePrice: formatPrice(
                    latestPrice.completionImageTokens,
                    formatPricePerImage,
                ),
            });
        }
    }

    // Add audio models (TTS and STT)
    for (const [serviceName, serviceConfig] of Object.entries(AUDIO_SERVICES)) {
        if ("hidden" in serviceConfig && serviceConfig.hidden) continue;
        const latestPrice = getActivePriceDefinition(
            serviceName as ModelName,
        ) as PriceDefinition | null;
        if (!latestPrice) continue;

        if (latestPrice.promptAudioSeconds) {
            // Speech-to-text (Whisper) — billed per input audio second
            prices.push({
                name: serviceName,
                type: serviceConfig.category,
                perToken: false,
                perSecondPrice: formatPrice(
                    latestPrice.promptAudioSeconds,
                    (v: number) => v.toFixed(5),
                ),
            });
        } else if (latestPrice.completionAudioSeconds) {
            // Music generation (ElevenLabs Music) — billed per output audio second
            prices.push({
                name: serviceName,
                type: serviceConfig.category,
                perToken: false,
                perSecondPrice: formatPrice(
                    latestPrice.completionAudioSeconds,
                    (v: number) => v.toFixed(4),
                ),
            });
        } else {
            // Text-to-speech is billed per character, shown as estimated output seconds.
            prices.push({
                name: serviceName,
                type: serviceConfig.category,
                perToken: false,
                perSecondPrice: formatPrice(
                    latestPrice.completionAudioTokens,
                    formatEstimatedTtsPricePerSecond,
                ),
            });
        }
    }

    // Merge real usage stats if available
    if (modelStats) {
        for (const price of prices) {
            const stats = modelStats[price.name];
            if (stats?.avgCost) {
                price.realAvgCost = stats.avgCost;
            }
        }
    }

    return prices;
};
