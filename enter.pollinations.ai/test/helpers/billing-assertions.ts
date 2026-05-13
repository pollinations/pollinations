import {
    calculateCost,
    calculatePrice,
    getActivePriceDefinition,
    getModelDefinition,
    type ModelName,
    type Usage,
} from "@shared/registry/registry.ts";
import { expect } from "vitest";

type BillingEvent = {
    isBilledUsage: boolean;
    modelProviderUsed?: string;
    selectedMeterSlug?: string | null;
    tokenPricePromptText: number;
    tokenPricePromptCached: number;
    tokenPricePromptAudio: number;
    tokenPricePromptImage: number;
    tokenPriceCompletionText: number;
    tokenPriceCompletionReasoning: number;
    tokenPriceCompletionAudio: number;
    tokenPriceCompletionImage: number;
    tokenPriceCompletionVideoSeconds?: number;
    tokenPriceCompletionVideoTokens?: number;
    tokenPriceBillingDollars?: number;
    tokenCountPromptText: number;
    tokenCountPromptCached: number;
    tokenCountPromptAudio: number;
    tokenCountPromptImage: number;
    tokenCountCompletionText: number;
    tokenCountCompletionReasoning: number;
    tokenCountCompletionAudio: number;
    tokenCountCompletionImage: number;
    tokenCountCompletionVideoSeconds?: number;
    tokenCountCompletionVideoTokens?: number;
    tokenCountBillingDollars?: number;
    totalCost: number;
    totalPrice: number;
};

function usageFromEvent(event: BillingEvent): Usage {
    return {
        promptTextTokens: event.tokenCountPromptText,
        promptCachedTokens: event.tokenCountPromptCached,
        promptAudioTokens: event.tokenCountPromptAudio,
        promptImageTokens: event.tokenCountPromptImage,
        completionTextTokens: event.tokenCountCompletionText,
        completionReasoningTokens: event.tokenCountCompletionReasoning,
        completionAudioTokens: event.tokenCountCompletionAudio,
        completionImageTokens: event.tokenCountCompletionImage,
        completionVideoSeconds: event.tokenCountCompletionVideoSeconds || 0,
        completionVideoTokens: event.tokenCountCompletionVideoTokens || 0,
        billingDollars: event.tokenCountBillingDollars || 0,
    };
}

export function assertTrackedBillingEvent(
    event: BillingEvent,
    modelName: ModelName,
): void {
    const modelDefinition = getModelDefinition(modelName);
    const priceDefinition = getActivePriceDefinition(modelName);
    const usage = usageFromEvent(event);
    const expectedCost = calculateCost(modelName, usage);
    const expectedPrice = calculatePrice(modelName, usage);

    expect(event.isBilledUsage).toBe(true);
    expect(event.modelProviderUsed).toBe(modelDefinition.provider);
    expect(priceDefinition).toBeTruthy();
    expect(event.selectedMeterSlug).toBeDefined();
    expect(event.selectedMeterSlug).not.toBeNull();

    expect(event.tokenPricePromptText).toBe(
        priceDefinition?.promptTextTokens || 0,
    );
    expect(event.tokenPricePromptCached).toBe(
        priceDefinition?.promptCachedTokens || 0,
    );
    expect(event.tokenPricePromptAudio).toBe(
        priceDefinition?.promptAudioTokens || 0,
    );
    expect(event.tokenPricePromptImage).toBe(
        priceDefinition?.promptImageTokens || 0,
    );
    expect(event.tokenPriceCompletionText).toBe(
        priceDefinition?.completionTextTokens || 0,
    );
    expect(event.tokenPriceCompletionReasoning).toBe(
        priceDefinition?.completionReasoningTokens ??
            priceDefinition?.completionTextTokens ??
            0,
    );
    expect(event.tokenPriceCompletionAudio).toBe(
        priceDefinition?.completionAudioTokens || 0,
    );
    expect(event.tokenPriceCompletionImage).toBe(
        priceDefinition?.completionImageTokens || 0,
    );
    expect(event.tokenPriceCompletionVideoSeconds || 0).toBe(
        priceDefinition?.completionVideoSeconds || 0,
    );
    expect(event.tokenPriceCompletionVideoTokens || 0).toBe(
        priceDefinition?.completionVideoTokens || 0,
    );
    expect(event.tokenPriceBillingDollars || 0).toBe(
        priceDefinition?.billingDollars || 0,
    );

    expect(event.totalCost).toBeCloseTo(expectedCost.totalCost, 8);
    expect(event.totalPrice).toBeCloseTo(expectedPrice.totalPrice, 8);
}
