import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.6-luna";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: ["chatgpt-luna", "chatgpt-5.6-luna", "gpt-5.6-luna"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-07-10").getTime(),
    // Provider retires this route on 2028-01-11.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0.2),
        promptCachedTokens: perMillion(0.02),
        promptCacheWriteTokens: perMillion(0.25),
        completionTextTokens: perMillion(1.2),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(0.4),
                promptCachedTokens: perMillion(0.04),
                promptCacheWriteTokens: perMillion(0.5),
                completionTextTokens: perMillion(1.8),
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
    title: "GPT-5.6 Luna",
    description: "Fast low-cost reasoning for everyday multimodal tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
