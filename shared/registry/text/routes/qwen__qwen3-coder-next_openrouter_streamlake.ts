import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-coder-next:openrouter:streamlake";
export const parent = "qwen/qwen3-coder-next";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterQwenCoderNext,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.18) * 1.055,
        promptCachedTokens: perMillion(0.036) * 1.055,
        completionTextTokens: perMillion(0.9) * 1.055,
    },
} satisfies FallbackDefinition;
