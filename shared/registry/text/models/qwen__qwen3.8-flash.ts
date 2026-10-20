import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.alibabaQwenReasoning,
    aliases: [],
    provider: "alibaba",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-09-05").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.15),
        promptCachedTokens: perMillion(0.016),
        promptCacheWriteTokens: perMillion(0.2),
        promptImageTokens: perMillion(0.15),
        promptVideoTokens: perMillion(0.15),
        completionTextTokens: perMillion(0.47),
    },
    title: "Qwen3.8 Flash",
    description:
        "Low-cost multimodal reasoning with 1M context and 131K output for agents and coding",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxReferenceVideos: 10,
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
