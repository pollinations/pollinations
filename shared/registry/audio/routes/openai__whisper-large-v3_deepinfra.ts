import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "openai/whisper-large-v3:deepinfra";
export const parent = "openai/whisper-large-v3";
export const order = 0;

export default {
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        // DeepInfra model metadata: $0.0000075/input second ($0.027/hour).
        promptAudioSeconds: 0.027 / 3600,
    },
} satisfies FallbackDefinition;
