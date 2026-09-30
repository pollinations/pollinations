import type { UsageType } from "./registry";

// Display units for legacy usage fields whose name does not describe the billed
// quantity. Prices still come from the live catalog; these are not rate overrides.
// Keep this small table separate from the runtime registry so the dashboard does
// not bundle providers, billing functions, or a stale copy of their prices.
export const MODEL_PRICE_UNITS: Record<
    string,
    Partial<
        Record<
            UsageType,
            {
                unit: "megapixel" | "token" | "request" | "byte";
                quantity?: number;
            }
        >
    >
> = {
    "qwen/qwen-image-2.1": {
        completionImageTokens: { unit: "megapixel", quantity: 1_000_000 },
    },
    "black-forest-labs/flux.2-pro": {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    "black-forest-labs/flux.2-flex": {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    "black-forest-labs/flux.2-max": {
        promptImageTokens: { unit: "megapixel" },
        completionImageTokens: { unit: "megapixel" },
    },
    "google/lyria-3-clip-preview": {
        completionAudioTokens: { unit: "request" },
    },
    "google/gemini-3.8-flash-tts": {
        completionAudioTokens: { unit: "token" },
    },
    "google/gemini-3.8-flash-lite-tts": {
        completionAudioTokens: { unit: "token" },
    },
    "fish-audio/s2.1-pro": {
        completionAudioTokens: { unit: "byte" },
    },
};
