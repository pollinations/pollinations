import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.7-plus";

export default {
    supportedParameters: CHAT_PARAMETERS.qwen37,
    aliases: [
        "qwen3.7",
        "qwen3.7-plus",
        "qwen3p7-plus",
        "qwen3.6",
        "qwen3.6-plus",
        "qwen3p6-plus",
        "qwen-large",
    ],
    provider: "openrouter",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-06-12").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // OpenRouter triples all token rates from 256K prompt tokens.
    cost: {
        promptTextTokens: perMillion(0.32) * 1.055,
        promptCachedTokens: perMillion(0.064) * 1.055,
        promptCacheWriteTokens: perMillion(0.4) * 1.055,
        completionTextTokens: perMillion(1.28) * 1.055,
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(0.96) * 1.055,
                promptCachedTokens: perMillion(0.192) * 1.055,
                promptCacheWriteTokens: perMillion(1.2) * 1.055,
                completionTextTokens: perMillion(3.84) * 1.055,
            },
        },
        longContextAtLeast(256_000),
        {
            long_context: {
                label: "Long context (256K+)",
                description:
                    "At least 256,000 prompt tokens; the higher rates apply to the whole request.",
            },
        },
        "<256K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "<256K",
                    "long_context": "≥256K",
                },
            },
        ],
    ),
    title: "Qwen3.7 Plus",
    description: "Multimodal agent intelligence for coding and productivity",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
