import type { FallbackMap } from "./merge-fallbacks";

export const AUDIO_FALLBACKS = {
    "openai/whisper-large-v3": {
        "openai/whisper-large-v3:fallback": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                // DeepInfra model metadata: $0.0000075/input second ($0.027/hour).
                promptAudioSeconds: 0.027 / 3600,
            },
        },
    },
} as const satisfies FallbackMap;
