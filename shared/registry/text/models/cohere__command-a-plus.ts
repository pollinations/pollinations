import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "cohere/command-a-plus";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterCohere,
    aliases: [
        "cohere-command-a-plus",
        "command-a-plus-05-2026",
        "cohere-command-a-plus-05-2026",
        "command-a-plus",
    ],
    provider: "openrouter",
    publisher: "Cohere",
    category: "text",
    addedDate: new Date("2026-07-30").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Cohere's OpenRouter route, including the 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.3) * 1.055,
        promptCachedTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(1.5) * 1.055,
    },
    title: "Cohere Command A+",
    description: "Multilingual agentic reasoning with tools and long context",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
