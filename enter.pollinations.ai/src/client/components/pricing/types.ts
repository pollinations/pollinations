export type ModelPrice = {
    name: string;
    type: "text" | "image" | "video";
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
    perTokenPrice?: string; // For token-based video models like seedance
};

export type Modalities = {
    input: string[];
    output: string[];
};
