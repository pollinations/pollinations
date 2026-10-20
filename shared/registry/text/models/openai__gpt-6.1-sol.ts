import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-6.1-sol";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: [],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-09-30").getTime(),
    paidOnly: false,
    priceMultiplier: 1,
    // OpenAI list rates; Azure has not published GPT-6.1 Sol rates yet.
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.1),
        promptCacheWriteTokens: perMillion(2.5),
        promptImageTokens: perMillion(2),
        completionTextTokens: perMillion(10),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(4),
                promptCachedTokens: perMillion(0.2),
                promptCacheWriteTokens: perMillion(5),
                promptImageTokens: perMillion(4),
                completionTextTokens: perMillion(15),
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
    title: "GPT-6.1 Sol",
    description:
        "Faster near-Astra reasoning for coding, agents, and professional work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 50, // Azure rejects more: "Exceeded maximum number of images (50)".
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
