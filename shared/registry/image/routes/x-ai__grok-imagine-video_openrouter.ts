import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "x-ai/grok-imagine-video:openrouter";
export const parent = "x-ai/grok-imagine-video";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptImageTokens: 0.002 * 1.055, // per start-frame image
        completionVideoSeconds: 0.07 * 1.055, // per sec at 720p
    },
} satisfies FallbackDefinition;
