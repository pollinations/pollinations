import type { UsageConversionDefinition } from "@/registry/registry";

export const ZERO_PRICE_START_DATE = new Date("2020-01-01 00:00:00").getTime();

// Convert dollars per million tokens to dollars per token
export function fromDPMT(dpmt: number): number {
    return dpmt / 1_000_000;
}

export const ZERO_PRICE: UsageConversionDefinition = {
    date: ZERO_PRICE_START_DATE,
    promptTextTokens: 0.0,
    promptCachedTokens: 0.0,
    completionTextTokens: 0.0,
    promptAudioTokens: 0.0,
    completionAudioTokens: 0.0,
    completionImageTokens: 0.0,
};

// Use a model provider's cost as the service price
export function costAsPrice(
    model: { cost: UsageConversionDefinition[] },
): UsageConversionDefinition[] {
    return model.cost;
}
