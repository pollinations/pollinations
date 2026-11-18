import {
    calculateUsageBilling,
    isFlatRateModel,
    isFreeModel,
    type ModelDefinition,
    type Usage,
    type UsageType,
} from "@shared/registry/registry.ts";
import { type ImageParams, pricingInputFromParams } from "./params.ts";

/** Why a price cannot be known before the generation runs. */
export const QUOTE_UNAVAILABLE_REASONS = {
    token_priced:
        "Billed per token; the token count is known only after generation.",
    provider_metered:
        "Billed from units the provider measures for the finished output.",
    input_dependent:
        "Depends on the size or length of the reference media in the request.",
} as const;

export type QuoteUnavailableReason = keyof typeof QUOTE_UNAVAILABLE_REASONS;

/**
 * Listed price of one image or video request with these options, or the reason
 * it cannot be known up front. A quote, never the charge: billing rates the
 * usage the provider reports. Rates, rate-sheet selection, fees and rounding
 * all come from `calculateUsageBilling`; this only states the usage the
 * options ask for.
 */
export function quoteMediaRequest(
    model: string,
    definition: ModelDefinition,
    params: Omit<ImageParams, "model">,
): number | QuoteUnavailableReason {
    const input = pricingInputFromParams(params);
    if (definition.billedSecondsFollowReference && input.hasReferenceVideo) {
        return "input_dependent";
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
                if (unit === "megapixel") return "provider_metered";
                if (!isFlatRateModel(definition)) return "token_priced";
                usage.completionImageTokens = 1;
                break;
            case "promptImageTokens":
                if (!input.hasImage) break;
                if (unit === "megapixel") return "input_dependent";
                usage.promptImageTokens = params.image.length;
                break;
            case "completionVideoSeconds":
                if (!duration) return "provider_metered";
                usage.completionVideoSeconds = duration;
                break;
            case "completionAudioSeconds":
                // Models with a separate sound rate bill it only on request.
                if (params.audio === true && duration) {
                    usage.completionAudioSeconds = duration;
                }
                break;
            case "promptVideoSeconds":
                if (input.hasReferenceVideo) return "input_dependent";
                break;
            default:
                return "token_priced";
        }
    }
    const price = bill(usage).price.totalPrice;
    // No listed rate on a paid model: the provider's own units set the charge.
    return price === 0 && !isFreeModel(definition) ? "provider_metered" : price;
}
