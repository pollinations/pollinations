import type { FallbackMap } from "./merge-fallbacks";

export const AUDIO_FALLBACKS = {
    "google/lyria-3.5": {
        "google/lyria-3.5:fal": {
            provider: "fal",
            addedDate: new Date("2026-09-26").getTime(),
            cost: {
                // fal bills per generation; callers retain Google's $0.08 quote.
                completionAudioTokens: 0.1,
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
