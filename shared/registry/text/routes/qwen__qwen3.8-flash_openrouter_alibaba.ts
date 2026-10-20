import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-flash:openrouter:alibaba";
export const parent = "qwen/qwen3.8-flash";

export default {
    provider: "openrouter",
    supportedParameters: CHAT_PARAMETERS.qwen38Max,
    // OpenRouter Alibaba route rates, equal to the Alibaba Singapore list
    // price with a single 0-1M context tier (2026-09-05). OpenRouter
    // publishes one prompt rate and no separate image/video rates.
    cost: {
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.016) * 1.055,
        promptCacheWriteTokens: perMillion(0.2) * 1.055,
        promptImageTokens: perMillion(0.15) * 1.055,
        promptVideoTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(0.47) * 1.055,
    },
} satisfies FallbackDefinition;
