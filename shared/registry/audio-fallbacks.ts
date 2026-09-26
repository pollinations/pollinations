import type { FallbackMap } from "./merge-fallbacks";

export const AUDIO_FALLBACKS = {
    "google/gemini-3.8-flash-tts": {
        "google/gemini-3.8-flash-tts:openrouter:ai-studio": {
            provider: "openrouter",
            cost: {
                promptTextTokens: (0.5 / 1_000_000) * 1.055,
                completionAudioTokens: (9 / 1_000_000) * 1.055,
            },
        },
    },
    "google/gemini-3.8-flash-lite-tts": {
        "google/gemini-3.8-flash-lite-tts:openrouter:ai-studio": {
            provider: "openrouter",
            cost: {
                promptTextTokens: (0.5 / 1_000_000) * 1.055,
                completionAudioTokens: (6 / 1_000_000) * 1.055,
            },
        },
    },
    "openai/whisper-large-v3": {
        "openai/whisper-large-v3:deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                // DeepInfra model metadata: $0.0000075/input second ($0.027/hour).
                promptAudioSeconds: 0.027 / 3600,
            },
        },
    },
} as const satisfies FallbackMap;
