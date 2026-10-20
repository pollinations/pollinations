import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "x-ai/grok-imagine-video-1.5:fal";
export const parent = "x-ai/grok-imagine-video-1.5";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptImageTokens: 0.01, // per start-frame image
        completionVideoSeconds: 0.14, // per sec at 720p
    },
    costVariants: {
        "480p": {
            completionVideoSeconds: 0.08,
        },
        "1080p": {
            completionVideoSeconds: 0.25,
        },
    },
} satisfies FallbackDefinition;
