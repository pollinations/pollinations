import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-large-4";

export default {
    supportedParameters: CHAT_PARAMETERS.mistralLarge4,
    aliases: [],
    provider: "mistral",
    publisher: "Mistral",
    category: "text",
    addedDate: new Date("2026-10-06").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Mistral direct API launch rates (docs.mistral.ai, 2026-10-06):
        // list price is $1.36 / $0.14 cached / $4.18 per million, shown
        // at half until the discount ends.
        promptTextTokens: perMillion(0.68),
        promptCachedTokens: perMillion(0.07),
        completionTextTokens: perMillion(2.09),
    },
    title: "Mistral Large 4",
    description:
        "Frontier multimodal model for reasoning, coding and agentic workloads with a 512K context",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 524288,
    isSpecialized: false,
} satisfies ModelDefinition;
