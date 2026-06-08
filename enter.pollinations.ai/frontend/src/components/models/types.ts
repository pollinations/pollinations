export type ModelCategory =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "embedding"
    | "realtime";

export type ModelCapability =
    | "tool_calling"
    | "reasoning"
    | "web_search"
    | "code_execution";

export type ModelPrice = {
    name: string;
    type: ModelCategory;
    displayName?: string;
    description?: string;
    brand?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    capabilities: ModelCapability[];
    paidOnly?: boolean;
    alpha?: boolean;
    addedDate?: number;
    inputSortPrice?: number;
    outputSortPrice?: number;
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
