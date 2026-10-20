import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/llama-4-scout";

export default {
    supportedParameters: CHAT_PARAMETERS.llamaScout,
    aliases: [
        "llama-4-scout",
        "llama-scout-17b",
        "llama-4-scout-17b-16e-instruct",
        "llama-scout",
    ],
    provider: "vercel",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-05-04").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    perUserRpm: 60,
    cost: {
        // Vercel AI Gateway pinned to DeepInfra, verified 2026-09-15.
        promptTextTokens: perMillion(0.1),
        promptImageTokens: perMillion(0.1),
        completionTextTokens: perMillion(0.3),
    },
    title: "Meta Llama 4 Scout",
    description:
        "Text and image understanding with a 128K context window; no tool calling or structured output",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Pollinations cap.
    tools: false,
    supportsStructuredOutput: false,
    maxCompletionTokens: 16384,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;
