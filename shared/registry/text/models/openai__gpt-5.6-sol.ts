import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.6-sol";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: ["chatgpt-sol", "chatgpt-5.6-sol", "gpt-5.6-sol"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-07-10").getTime(),
    // Provider retires this route on 2028-01-11.
    // Preserve the existing one-third customer price multiplier.
    priceMultiplier: 1 / 3,
    paidOnly: false,
    // Azure Global Standard rates (retail prices API and billed meters,
    // 2026-10-12).
    cost: {
        promptTextTokens: perMillion(4.0),
        promptCachedTokens: perMillion(0.4),
        promptCacheWriteTokens: perMillion(5.0),
        completionTextTokens: perMillion(20.0),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(8.0),
                promptCachedTokens: perMillion(0.8),
                promptCacheWriteTokens: perMillion(10.0),
                completionTextTokens: perMillion(30.0),
            },
        },
        longContextAbove(272_000),
        {
            long_context: {
                label: "Long context (>272K)",
                description:
                    "More than 272,000 prompt tokens; the higher rates apply to the full request.",
            },
        },
        "≤272K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "≤272K",
                    "long_context": ">272K",
                },
            },
        ],
    ),
    title: "GPT-5.6 Sol",
    description: "Frontier reasoning for complex multimodal tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
