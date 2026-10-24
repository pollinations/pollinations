import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-haiku-5.5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoForcedTools,
    aliases: [],
    provider: "anthropic",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-10-07").getTime(),
    paidOnly: true,
    priceMultiplier: 0.75,
    cost: {
        // Anthropic global standard rates (prompts up to 100K tokens);
        // 5-minute cache writes.
        promptTextTokens: perMillion(0.1),
        promptCachedTokens: perMillion(0.01),
        promptCacheWriteTokens: perMillion(0.125),
        completionTextTokens: perMillion(0.5),
    },
    // Prompts over 100K tokens bill every token of the request at 5x
    // input and cache rates and 5x output.
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.05),
                promptCacheWriteTokens: perMillion(0.625),
                completionTextTokens: perMillion(2.5),
            },
        },
        longContextAbove(100_000),
        {
            long_context: {
                label: "Long context (>100K)",
                description:
                    "More than 100,000 prompt tokens; the higher rates apply to the whole request.",
            },
        },
        "≤100K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "≤100K",
                    "long_context": ">100K",
                },
            },
        ],
    ),
    title: "Claude Haiku 5.5",
    description:
        "Low-cost adaptive reasoning for everyday tasks, tool use and high-volume sub-agents",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Preserve the image limit across the AWS fallback.
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
