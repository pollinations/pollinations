import type { FallbackDefinition } from "../../merge-fallbacks";

export const id = "qwen/qwen-image-2.1-pro:openrouter";
export const parent = "qwen/qwen-image-2.1-pro";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-10-18").getTime(),
    // OpenRouter's Alibaba endpoint. Maintainer probe (2026-10-18):
    // usage.cost is $0.046 per image before the 5.5% credit fee, so this
    // route is above the $0.04 primary price. Up to 4 references.
    cost: {
        completionImageTokens: 0.046 * 1.055,
    },
} satisfies FallbackDefinition;
