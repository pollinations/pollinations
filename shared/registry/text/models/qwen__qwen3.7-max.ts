import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.7-max";

export default {
    supportedParameters: CHAT_PARAMETERS.qwen37,
    aliases: ["qwen-max", "qwen3p7-max", "qwen3.7-max"],
    provider: "openrouter",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(1.475) * 1.055,
        promptCachedTokens: perMillion(0.295) * 1.055,
        promptCacheWriteTokens: perMillion(1.84375) * 1.055,
        completionTextTokens: perMillion(4.425) * 1.055,
    },
    title: "Qwen3.7 Max",
    description: "Flagship long-context model for coding and autonomous agents",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
