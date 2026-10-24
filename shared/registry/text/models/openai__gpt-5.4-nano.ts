import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.4-nano";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGpt,
    aliases: ["gpt-5.4-nano", "openai"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    // Provider retires this route on 2027-09-21.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.2),
        promptCachedTokens: perMillion(0.02),
        completionTextTokens: perMillion(1.25),
    },
    title: "GPT-5.4 Nano",
    description:
        "Fast, affordable all-rounder for everyday chat and image questions",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Azure OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    reasoning: true,
    contextLength: 400000,
    isSpecialized: false,
} satisfies ModelDefinition;
