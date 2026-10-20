import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "inception/mercury-2";

export default {
    supportedParameters: CHAT_PARAMETERS.mercury,
    aliases: ["mercury-2", "inception", "inception-mercury", "mercury"],
    provider: "openrouter",
    publisher: "Inception",
    category: "text",
    addedDate: new Date("2026-06-23").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.25) * 1.055,
        promptCachedTokens: perMillion(0.025) * 1.055,
        completionTextTokens: perMillion(0.75) * 1.055,
    },
    title: "Mercury 2",
    description:
        "Near-instant responses for real-time apps; skip it for heavy reasoning",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
