import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-6-luna";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: [],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-09-22").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    cost: {
        promptTextTokens: perMillion(0.1),
        promptCachedTokens: perMillion(0.01),
        promptCacheWriteTokens: perMillion(0.125),
        promptImageTokens: perMillion(0.1),
        completionTextTokens: perMillion(0.5),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.02),
                promptCacheWriteTokens: perMillion(0.25),
                promptImageTokens: perMillion(0.2),
                completionTextTokens: perMillion(0.75),
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
    title: "GPT-6 Luna",
    description: "Efficient reasoning for focused, high-volume tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 50, // Azure rejects more: "Exceeded maximum number of images (50)".
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
