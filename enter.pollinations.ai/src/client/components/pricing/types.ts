export type ModelPrice = {
    name: string;
    type: "text" | "image";
    perToken?: boolean;
    // Text pricing
    promptTextPrice?: string;
    promptCachedPrice?: string;
    promptAudioPrice?: string;
    completionTextPrice?: string;
    completionAudioPrice?: string;
    completionAudioTokens?: string;  // For audio calculation
    // Image pricing
    promptImagePrice?: string;
    completionImagePrice?: string;
    perImagePrice?: string;
};

export type Modalities = {
    input: string[];
    output: string[];
};
