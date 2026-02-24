export type ModelPrice = {
    name: string;
    type: "text" | "image" | "video" | "audio";
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
    perSecondPrice?: string;
    perAudioSecondPrice?: string; // For video models with audio (e.g., wan)
    perTokenPrice?: string; // For token-based video models like seedance
    // Audio/TTS pricing
    perCharPrice?: string; // Per 1000 characters (e.g., ElevenLabs TTS)
    // Real usage data from Tinybird (rolling 7-day average)
    realAvgCost?: number;
};

export type Modalities = {
    input: string[];
    output: string[];
};
