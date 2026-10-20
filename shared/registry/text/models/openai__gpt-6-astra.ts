import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-6-astra";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: [],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-09-04").getTime(),
    // Provider retires this route on 2028-01-11.
    priceMultiplier: 1,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(10.0),
        promptCachedTokens: perMillion(1.0),
        promptCacheWriteTokens: perMillion(12.5),
        completionTextTokens: perMillion(50.0),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(20.0),
                promptCachedTokens: perMillion(2.0),
                promptCacheWriteTokens: perMillion(25.0),
                completionTextTokens: perMillion(75.0),
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
    title: "GPT-6 Astra",
    description:
        "Frontier reasoning for complex agentic, coding, and multimodal work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
