import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-sonnet-4.6";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeSampling,
    aliases: ["claude-sonnet-4.6", "claude-sonnet", "claude"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2025-11-05").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-sonnet-4-6 global standard rates.
        promptTextTokens: perMillion(3),
        promptCachedTokens: perMillion(0.3),
        promptCacheWriteTokens: perMillion(3.75),
        completionTextTokens: perMillion(15),
    },
    title: "Claude Sonnet 4.6",
    description:
        "Excellent writing, coding and analysis with balanced speed and cost",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000, // Bedrock global Claude Sonnet 4.6 context window.
    isSpecialized: false,
} satisfies ModelDefinition;
