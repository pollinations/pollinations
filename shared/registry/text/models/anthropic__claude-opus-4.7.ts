import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-4.7";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoSampling,
    aliases: ["claude-opus-4.7"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-04-22").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-opus-4-7 global standard rates.
        promptTextTokens: perMillion(5),
        promptCachedTokens: perMillion(0.5),
        promptCacheWriteTokens: perMillion(6.25),
        completionTextTokens: perMillion(25),
    },
    title: "Claude Opus 4.7",
    description:
        "Heavyweight reasoning and analysis; built for hard problems, not quick replies",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000, // Bedrock global Claude Opus 4.7 context window.
    isSpecialized: false,
} satisfies ModelDefinition;
