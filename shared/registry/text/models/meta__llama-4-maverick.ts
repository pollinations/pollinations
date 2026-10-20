import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/llama-4-maverick";

export default {
    supportedParameters: CHAT_PARAMETERS.azureOpenModels,
    aliases: [
        "llama-4",
        "llama-4-maverick",
        "llama-maverick-17b",
        "llama-4-maverick-17b-128e-instruct-fp8",
        "llama-maverick",
    ],
    provider: "azure",
    publisher: "Meta",
    category: "text",
    addedDate: new Date("2026-05-04").getTime(),
    priceMultiplier: 0.75,
    cost: {
        promptTextTokens: perMillion(0.25),
        completionTextTokens: perMillion(1.0),
    },
    title: "Meta Llama 4 Maverick",
    description:
        "Open-source chat that understands images, with a huge context window",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    contextLength: 1048576,
    isSpecialized: false,
    paidOnly: true,
} satisfies ModelDefinition;
