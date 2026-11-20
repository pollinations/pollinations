import {
    calculateUsageBilling,
    isFlatRateModel,
    isFreeModel,
    type ModelDefinition,
    type Usage,
    type UsageType,
} from "@shared/registry/registry.ts";
import { type MediaPriceParams, pricingInputFromParams } from "./params.ts";

/**
 * Listed price of one image or video request with these options, or undefined
 * when it is known only after generation (token-priced, provider-metered or
 * set by the reference media). A quote, never the charge: billing rates the
 * usage the provider reports. Rates, rate-sheet selection, fees and rounding
 * all come from `calculateUsageBilling`; this only states the usage the
 * options ask for.
 */
export function quoteMediaRequest(
    model: string,
    definition: ModelDefinition,
    params: MediaPriceParams,
): number | undefined {
    const input = pricingInputFromParams(params);
    if (definition.billedSecondsFollowReference && input.hasReferenceVideo) {
        return undefined;
    }

    const bill = (usage: Usage) =>
        calculateUsageBilling({ model, usage, servedBy: definition, input });
    const requested = params.duration ?? definition.defaultDuration;
    const duration =
        requested && Math.max(requested, definition.minBilledSeconds ?? 0);
    const usage: Usage = {};
    for (const [usageType, rate] of Object.entries(bill({}).priceDefinition)) {
        if (!rate) continue;
        const unit = definition.priceUnits?.[usageType as UsageType]?.unit;
        switch (usageType) {
            case "completionImageTokens":
                // Providers round megapixels their own way.
                if (unit === "megapixel") return undefined;
                if (!isFlatRateModel(definition)) return undefined;
                usage.completionImageTokens = 1;
                break;
            case "promptImageTokens":
                if (!input.hasImage) break;
                if (unit === "megapixel") return undefined;
                usage.promptImageTokens = params.image.length;
                break;
            case "completionVideoSeconds":
                if (!duration) return undefined;
                usage.completionVideoSeconds = duration;
                break;
            case "completionAudioSeconds":
                // Models with a separate sound rate bill it only on request.
                if (params.audio === true && duration) {
                    usage.completionAudioSeconds = duration;
                }
                break;
            case "promptVideoSeconds":
                if (input.hasReferenceVideo) return undefined;
                break;
            default:
                return undefined;
        }
    }
    const price = bill(usage).price.totalPrice;
    // No listed rate on a paid model: the provider's own units set the charge.
    return price === 0 && !isFreeModel(definition) ? undefined : price;
}
