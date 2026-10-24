import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-27b:openrouter:reka-fp8";
export const parent = "qwen/qwen3.8-27b";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.qwen38Reka,
    provider: "openrouter",
    addedDate: new Date("2026-10-13").getTime(),
    cost: {
        // OpenRouter Reka FP8 rates (2026-10-13), including the
        // account's 5.5% credit-purchase fee. OpenRouter publishes one
        // prompt rate and no separate image/video rates.
        promptTextTokens: perMillion(0.04) * 1.055,
        promptCachedTokens: perMillion(0.02) * 1.055,
        promptImageTokens: perMillion(0.04) * 1.055,
        promptVideoTokens: perMillion(0.04) * 1.055,
        completionTextTokens: perMillion(2.2) * 1.055,
    },
} satisfies FallbackDefinition;
