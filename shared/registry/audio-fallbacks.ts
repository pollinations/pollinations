import type { FallbackMap } from "./merge-fallbacks";

export const AUDIO_FALLBACKS = {
    "microsoft/mai-transcribe-2": {
        "microsoft/mai-transcribe-2:vercel": {
            provider: "vercel",
            cost: { promptAudioSeconds: 0.1 / 3600 },
        },
    },
    "microsoft/mai-voice-2.1": {
        "microsoft/mai-voice-2.1:vercel": {
            provider: "vercel",
            cost: { completionAudioTokens: 22 / 1_000_000 },
        },
    },
    "microsoft/mai-voice-2.1-flash": {
        "microsoft/mai-voice-2.1-flash:vercel": {
            provider: "vercel",
            cost: { completionAudioTokens: 15 / 1_000_000 },
        },
    },
    "google/gemini-3.5-transcribe": {
        "google/gemini-3.5-transcribe:openrouter": {
            provider: "openrouter",
            cost: {
                // Callers retain Vertex pricing; Pollinations absorbs this fee.
                promptAudioTokens: (2 / 1_000_000) * 1.055,
                completionTextTokens: (12 / 1_000_000) * 1.055,
            },
        },
    },
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
