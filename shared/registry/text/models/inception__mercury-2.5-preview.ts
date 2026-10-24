import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inception/mercury-2.5-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.mercury25,
    aliases: [],
    provider: "openrouter",
    publisher: "Inception",
    category: "text",
    addedDate: new Date("2026-09-01").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // OpenRouter's exact Inception route rates (2026-09-01).
    cost: {
        promptTextTokens: perMillion(0.04) * 1.055,
        promptCachedTokens: perMillion(0.004) * 1.055,
        completionTextTokens: perMillion(0.15) * 1.055,
    },
    title: "Mercury 2.5 Preview",
    description:
        "Ultra-fast diffusion reasoning for coding, tool use, and structured outputs",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 260000,
    isSpecialized: false,
} satisfies ModelDefinition;
