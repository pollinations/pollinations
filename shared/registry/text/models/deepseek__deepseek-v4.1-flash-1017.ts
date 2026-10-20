import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4.1-flash-1017";

export default {
    supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
    aliases: [],
    provider: "fireworks",
    publisher: "DeepSeek",
    category: "text",
    addedDate: new Date("2026-10-18").getTime(),
    // 0.5x matches DeepInfra's output price (0.60 per M).
    priceMultiplier: 0.5,
    paidOnly: true,
    // Fireworks standard serverless rates (2026-10-18).
    cost: {
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.006),
        completionTextTokens: perMillion(1.2),
    },
    title: "DeepSeek V4.1 Flash 1017",
    description: "Reasoning, coding, tool calling, and image understanding.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
