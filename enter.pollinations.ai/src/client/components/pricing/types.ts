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
};

export type Modalities = {
    input: string[];
    output: string[];
};
