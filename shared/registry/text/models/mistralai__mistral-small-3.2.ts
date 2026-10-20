import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-small-3.2";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterMistralSmall32,
    aliases: [
        "mistral-small-3.1",
        "mistral-small-2503",
        "mistral-small-3.2-24b-instruct-2506",
        "mistral-small-3.2",
    ],
    provider: "openrouter",
    publisher: "Mistral",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.075) * 1.055,
        completionTextTokens: perMillion(0.2) * 1.055,
    },
    title: "Mistral Small 3.2",
    description:
        "Follows instructions reliably and calls functions well, at low cost",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 128000,
    isSpecialized: false,
} satisfies ModelDefinition;
