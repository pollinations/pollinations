import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "microsoft/trellis-2:fal";
export const parent = "microsoft/trellis-2";
export const order = 0;

export default {
    provider: "fal",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        completionImageTokens: 0.25,
    },
    costVariants: {
        medium: { completionImageTokens: 0.3 },
        high: { completionImageTokens: 0.35 },
    },
} satisfies FallbackDefinition;
