import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-4.6";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeSampling,
    aliases: ["claude-opus-4.5", "claude-opus-4.6"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2025-11-10").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-opus-4-6 global standard rates.
        promptTextTokens: perMillion(5),
        promptCachedTokens: perMillion(0.5),
        promptCacheWriteTokens: perMillion(6.25),
        completionTextTokens: perMillion(25),
    },
    title: "Claude Opus 4.6",
    description:
        "Deep analysis and careful reasoning for tough problems; slower and premium-priced",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000, // Bedrock global Claude Opus 4.6 context window.
    isSpecialized: false,
} satisfies ModelDefinition;
