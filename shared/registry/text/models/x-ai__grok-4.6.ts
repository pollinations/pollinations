import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.6";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGrok46,
    aliases: ["grok-4.5", "grok-4-5", "grok-4.6"],
    provider: "azure",
    publisher: "xAI",
    category: "text",
    addedDate: new Date("2026-07-18").getTime(),
    // Provider retires this route on 2027-08-24.
    paidOnly: false,
    priceMultiplier: 0.75,
    // Microsoft Foundry Global Standard rates, published August 26, 2026.
    // The direct route reports image tokens separately from text tokens.
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.5),
        promptImageTokens: perMillion(2),
        completionTextTokens: perMillion(6),
    },
    title: "Grok 4.6",
    description: "Frontier reasoning for coding and knowledge work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    // Azure's Global Standard deployment is capped at 200K context.
    contextLength: 200000,
    isSpecialized: false,
} satisfies ModelDefinition;
