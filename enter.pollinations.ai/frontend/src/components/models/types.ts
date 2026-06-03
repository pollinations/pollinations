import type { Category } from "@shared/registry/registry.ts";

export type ModelPriceType = Category | "community";

export type ModelPrice = {
    name: string;
    displayName?: string;
    description?: string;
    brandLogoPath?: string;
    type: ModelPriceType;
    perToken?: boolean;
    // Text pricing
    promptTextPrice?: string;
    promptCachedPrice?: string;
    promptAudioPrice?: string;
    completionTextPrice?: string;
    completionAudioPrice?: string;
    completionAudioTokens?: string; // For audio calculation
    // Image pricing
    promptImagePrice?: string;
    completionImagePrice?: string;
    perImagePrice?: string;
    // Video pricing
    promptVideoPrice?: string;
    perSecondPrice?: string;
    perAudioSecondPrice?: string; // For video models with audio (e.g., wan)
    perTokenPrice?: string; // For token-based video models like seedance
    // Real usage data from Tinybird (rolling 7-day average)
    realAvgCost?: number;
};

export type Modalities = {
    input: string[];
    output: string[];
};
