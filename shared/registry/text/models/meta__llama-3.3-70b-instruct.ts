import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/llama-3.3-70b-instruct";

export default {
    supportedParameters: CHAT_PARAMETERS.azureOpenModels,
    aliases: ["llama-3.3", "llama-3.3-70b", "llama-v3p3-70b-instruct", "llama"],
    provider: "azure",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-05-01").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.71),
        completionTextTokens: perMillion(0.71),
    },
    title: "Meta Llama 3.3 70B",
    description:
        "Open-source workhorse for general chat and summarization; text only",
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 131072,
    isSpecialized: false,
} satisfies ModelDefinition;
