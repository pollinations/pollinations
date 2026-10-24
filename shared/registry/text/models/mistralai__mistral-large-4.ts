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
        // Mistral direct API list rates (docs.mistral.ai pricing); the
        // 50% launch offer from 2026-10-06 ran for two weeks.
        promptTextTokens: perMillion(1.36),
        promptCachedTokens: perMillion(0.14),
        completionTextTokens: perMillion(4.18),
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
