import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-vl-235b-a22b-thinking:openrouter:novita-bf16";
export const parent = "qwen/qwen3-vl-235b-a22b-thinking";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterQwenVl,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.98) * 1.055,
        promptImageTokens: perMillion(0.98) * 1.055,
        completionTextTokens: perMillion(3.95) * 1.055,
        completionReasoningTokens: perMillion(3.95) * 1.055,
    },
} satisfies FallbackDefinition;
