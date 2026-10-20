import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-4o-mini";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGpt4oMini,
    aliases: [],
    provider: "openrouter",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-09-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Azure/OpenAI route rates (2026-09-21), including the
        // account's 5.5% credit-purchase fee. Image inputs are tokenized
        // into promptTextTokens; no separate image usage is reported.
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.075) * 1.055,
        completionTextTokens: perMillion(0.6) * 1.055,
    },
    title: "GPT-4o Mini",
    description:
        "Affordable multimodal chat with vision input for everyday tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
