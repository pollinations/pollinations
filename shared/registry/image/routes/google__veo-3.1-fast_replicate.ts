import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "google/veo-3.1-fast:replicate";
export const parent = "google/veo-3.1-fast";
export const order = 0;

export default {
    provider: "replicate",
    // https://replicate.com/google/veo-3.1-fast: $0.10/s silent,
    // $0.15/s with audio at either resolution. Keep the caller's
    // Google quote; absorb the approved $0–$0.05/s fallback difference.
    cost: {
        completionVideoSeconds: 0.1,
        completionAudioSeconds: 0.05,
    },
} satisfies FallbackDefinition;
