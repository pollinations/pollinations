import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-large-3";

export default {
    supportedParameters: CHAT_PARAMETERS.azureOpenModels,
    aliases: ["mistral-large-3", "mistral-large"],
    provider: "azure",
    publisher: "Mistral",
    category: "text",
    addedDate: new Date("2026-04-09").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.5),
        promptCachedTokens: perMillion(0.05),
        completionTextTokens: perMillion(1.5),
    },
    title: "Mistral Large 3",
    description:
        "Polished multilingual writing and reasoning with image understanding",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 256000,
    isSpecialized: false,
} satisfies ModelDefinition;
