import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3-vl-30b-a3b-instruct";

export default {
    supportedParameters: CHAT_PARAMETERS.qwenVl,
    aliases: [
        "qwen3-vl",
        "qwen3-vl-30b-a3b-instruct",
        "qwen3-vl-instruct",
        "qwen3-vl-plus",
        "qwen-vl",
        "qwen-vision",
    ],
    provider: "openrouter",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-03-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(0.6) * 1.055,
    },
    title: "Qwen3 VL 30B A3B Instruct",
    description:
        "Describes images, reads text in them, and analyzes visual content",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: false,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;
