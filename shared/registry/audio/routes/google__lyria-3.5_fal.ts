import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "google/lyria-3.5:fal";
export const parent = "google/lyria-3.5";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-26").getTime(),
    cost: {
        // fal bills per generation; callers retain Google's $0.08 quote.
        completionAudioTokens: 0.1,
    },
} satisfies FallbackDefinition;
