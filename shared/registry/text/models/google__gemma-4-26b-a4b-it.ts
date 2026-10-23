import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemma-4-26b-a4b-it";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGemma,
    aliases: [
        "gemma-4",
        "gemma-4-26b",
        "gemma-4-26b-a4b",
        "gemma-4-26b-a4b-it",
        "gemma",
    ],
    provider: "openrouter",
    addedDate: new Date("2026-05-08").getTime(),
    publisher: "Google",
    category: "text",
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter DeepInfra FP8; rates verified 2026-10-22.
        promptTextTokens: perMillion(0.07) * 1.055,
        promptImageTokens: perMillion(0.07) * 1.055,
        completionTextTokens: perMillion(0.34) * 1.055,
    },
    title: "Gemma 4 26B A4B",
    description:
        "Efficient open-source chat with image understanding; modest on hard problems",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
