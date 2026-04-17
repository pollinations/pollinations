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

export const getModelPrices = (modelStats?: ModelStats): ModelPrice[] => {
    const prices: ModelPrice[] = [];

    // Add text models
    for (const serviceName of Object.keys(TEXT_SERVICES)) {
        const latestPrice = getActivePriceDefinition(serviceName as ModelName);
        if (!latestPrice) continue;

        prices.push({
            name: serviceName,
            type: "text",
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

    // Add image/video models - use outputModalities to determine type
    for (const [serviceName, serviceConfig] of Object.entries(IMAGE_SERVICES)) {
        const latestPrice: PriceDefinition | null = getActivePriceDefinition(
            serviceName as ModelName,
        );
        if (!latestPrice) continue;
        const outputType = serviceConfig.outputModalities?.[0] || "image";

        if (outputType === "video") {
            // Check if it's token-based (seedance) or second-based (veo)
            if (latestPrice.completionVideoTokens) {
                prices.push({
                    name: serviceName,
                    type: "video",
                    perToken: true,
                    perTokenPrice: formatPrice(
                        latestPrice.completionVideoTokens,
                        formatPricePer1M,
                    ),
                });
            } else {
                prices.push({
                    name: serviceName,
                    type: "video",
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
                type: "image",
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
                type: "image",
                perToken: false,
                perImagePrice: formatPrice(
                    latestPrice.completionImageTokens,
                    formatPricePerImage,
                ),
            });
        }
    }

    // Add audio models (TTS and STT)
    for (const serviceName of Object.keys(AUDIO_SERVICES)) {
        const latestPrice = getActivePriceDefinition(serviceName as ModelName);
        if (!latestPrice) continue;

        if (latestPrice.promptAudioSeconds) {
            // Speech-to-text (Whisper) — billed per input audio second
            prices.push({
                name: serviceName,
                type: "audio",
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
                type: "audio",
                perToken: false,
                perSecondPrice: formatPrice(
                    latestPrice.completionAudioSeconds,
                    (v: number) => v.toFixed(4),
                ),
            });
        } else {
            // Text-to-speech (ElevenLabs TTS) — billed per character
            prices.push({
                name: serviceName,
                type: "audio",
                perToken: false,
                perCharPrice: formatPrice(
                    latestPrice.completionAudioTokens,
                    (v: number) => (v * 1000).toFixed(2),
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
