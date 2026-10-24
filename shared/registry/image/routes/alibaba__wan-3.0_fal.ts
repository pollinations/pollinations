import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "alibaba/wan-3.0:fal";
export const parent = "alibaba/wan-3.0";
export const order = 0;

export default {
    provider: "fal",
    // Fal Prime bills output only; retain the Alibaba quote.
    cost: { promptVideoSeconds: 0, completionVideoSeconds: 0.068 },
    costVariants: {
        "720p": { promptVideoSeconds: 0, completionVideoSeconds: 0.14 },
        "1080p": {
            promptVideoSeconds: 0,
            completionVideoSeconds: 0.28,
        },
    },
} satisfies FallbackDefinition;
