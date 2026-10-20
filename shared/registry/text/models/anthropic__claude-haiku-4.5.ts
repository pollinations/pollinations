import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-haiku-4.5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeSampling,
    aliases: ["claude-haiku-4.5", "claude-haiku", "claude-fast"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2025-12-01").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-haiku-4-5 global standard rates.
        promptTextTokens: perMillion(1),
        promptCachedTokens: perMillion(0.1),
        promptCacheWriteTokens: perMillion(1.25),
        completionTextTokens: perMillion(5),
    },
    title: "Claude Haiku 4.5",
    description:
        "Quick, capable chat and coding at low cost; great for high-volume tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 200000,
    isSpecialized: false,
} satisfies ModelDefinition;
