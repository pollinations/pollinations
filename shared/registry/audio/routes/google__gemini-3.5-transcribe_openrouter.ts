import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "google/gemini-3.5-transcribe:openrouter";
export const parent = "google/gemini-3.5-transcribe";
export const order = 0;

export default {
    provider: "openrouter",
    cost: {
        // Callers retain Vertex pricing; Pollinations absorbs this fee.
        promptAudioTokens: (2 / 1_000_000) * 1.055,
        completionTextTokens: (12 / 1_000_000) * 1.055,
    },
} satisfies FallbackDefinition;
