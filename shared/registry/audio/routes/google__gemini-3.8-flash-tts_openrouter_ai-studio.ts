import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "google/gemini-3.8-flash-tts:openrouter:ai-studio";
export const parent = "google/gemini-3.8-flash-tts";
export const order = 0;

export default {
    provider: "openrouter",
    cost: {
        promptTextTokens: (0.5 / 1_000_000) * 1.055,
        completionAudioTokens: (9 / 1_000_000) * 1.055,
    },
} satisfies FallbackDefinition;
