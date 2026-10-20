import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5-nano";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGpt,
    aliases: ["gpt-5-nano", "gpt-5-nano-2025-08-07", "openai-fast"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    // Provider retires this route on 2027-02-09.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.05),
        promptCachedTokens: perMillion(0.005),
        completionTextTokens: perMillion(0.4),
    },
    title: "GPT-5 Nano",
    description:
        "Ultra-fast and ultra-cheap for simple tasks; not built for hard problems",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Azure OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    reasoning: true,
    contextLength: 400000,
    isSpecialized: false,
} satisfies ModelDefinition;
