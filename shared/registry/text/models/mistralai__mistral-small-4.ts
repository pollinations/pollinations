import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-small-4";

export default {
    supportedParameters: CHAT_PARAMETERS.mistralSmall4,
    aliases: [
        "mistral-4",
        "mistral-small",
        "mistral-small-4",
        "mistral-small-2603",
        "mistral",
    ],
    provider: "mistral",
    publisher: "Mistral",
    category: "text",
    addedDate: new Date("2026-05-15").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    perUserRpm: 60,
    cost: {
        // Mistral direct API, verified 2026-09-20.
        promptTextTokens: perMillion(0.15),
        promptCachedTokens: perMillion(0.015),
        promptImageTokens: perMillion(0.15),
        completionTextTokens: perMillion(0.6),
    },
    title: "Mistral Small 4",
    description:
        "Compact all-rounder that combines reasoning with image understanding",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 8,
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
