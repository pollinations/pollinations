import type { FallbackDefinition } from "../../merge-fallbacks";
export const id = "qwen/qwen-image-3:openrouter";
export const parent = "qwen/qwen-image-3";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-10-14").getTime(),
    // OpenRouter's qwen/qwen-image-3-pro on Alibaba: the primary's
    // exact checkpoint. The handler records OpenRouter's reported
    // usage.cost plus the 5.5% credit fee; these rates describe the
    // route at 1K.
    cost: {
        promptImageTokens: 0.003 * 1.055,
        completionImageTokens: 0.04 * 1.055,
    },
} satisfies FallbackDefinition;
