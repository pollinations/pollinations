import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemma-4-31b-it";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGemma,
    aliases: ["gemma-large", "gemma-4-31b-it", "gemma-4-31b"],
    provider: "openrouter",
    addedDate: new Date("2026-07-18").getTime(),
    publisher: "Google",
    category: "text",
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // OpenRouter Novita BF16 endpoint, verified 2026-08-22.
        promptTextTokens: perMillion(0.14) * 1.055,
        promptImageTokens: perMillion(0.14) * 1.055,
        completionTextTokens: perMillion(0.4) * 1.055,
    },
    title: "Gemma 4 31B",
    description: "Dense multimodal reasoning with configurable thinking",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
