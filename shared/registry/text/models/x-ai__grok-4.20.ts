import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.20";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGrokReasoning,
    aliases: [
        "grok-fast",
        "grok-4-1-fast",
        "grok-4-1-fast-non-reasoning",
        "grok-legacy",
        "grok-4",
        "grok-4-fast",
        "grok-4-20-non-reasoning",
        "grok-non-reasoning",
        "grok-4-20-reasoning",
        "grok-4-20",
        "grok-4-1-fast-reasoning",
        "grok",
    ],
    provider: "azure",
    publisher: "xAI",
    category: "text",
    addedDate: new Date("2025-11-10").getTime(),
    // Provider retires this route on 2027-04-06.
    priceMultiplier: 0.75,
    paidOnly: false,
    // Azure Global Standard meters "Grok 4.2 Inp/Outp glbl" ($1.25 / $2.50
    // per 1M, effective 2026-05-01), the same rates as grok-4.3.
    cost: {
        promptTextTokens: perMillion(1.25),
        promptCachedTokens: perMillion(0.2),
        promptImageTokens: perMillion(1.25),
        completionTextTokens: perMillion(2.5),
    },
    title: "Grok 4.20",
    description: "Multimodal chat and tool calling with optional reasoning",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    reasoning: true,
    contextLength: 262144,
    isSpecialized: false,
} satisfies ModelDefinition;
