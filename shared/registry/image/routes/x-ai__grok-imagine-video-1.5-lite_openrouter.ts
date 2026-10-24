import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "x-ai/grok-imagine-video-1.5-lite:openrouter";
export const parent = "x-ai/grok-imagine-video-1.5-lite";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-10-06").getTime(),
    cost: {
        promptImageTokens: 0.01 * 1.055, // per start-frame image
        completionVideoSeconds: 0.03 * 1.055, // per sec at 720p
    },
    costVariants: {
        "480p": {
            completionVideoSeconds: 0.02 * 1.055,
        },
        "1080p": {
            completionVideoSeconds: 0.14 * 1.055,
        },
    },
} satisfies FallbackDefinition;
