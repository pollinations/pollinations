import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-coder-next";

export default {
    supportedParameters: CHAT_PARAMETERS.qwenCoderNext,
    aliases: ["qwen3-coder-next", "qwen-coder-large"],
    provider: "openrouter",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-03-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // OpenRouter Parasail BF16 endpoint, verified 2026-08-22.
    cost: {
        promptTextTokens: perMillion(0.12) * 1.055, // per 1M tokens
        promptCachedTokens: perMillion(0.07) * 1.055, // per 1M cached input tokens
        completionTextTokens: perMillion(0.8) * 1.055, // per 1M tokens
    },
    title: "Qwen3 Coder Next",
    description:
        "Advanced code generation for demanding projects; code-focused, text only",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
