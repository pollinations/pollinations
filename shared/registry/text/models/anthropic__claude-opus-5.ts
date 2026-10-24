import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoSampling,
    aliases: [
        "claude-opus-5",
        "claude-opus-4.8",
        "claude-opus",
        "claude-large",
    ],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-05-29").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-opus-5 global standard rates.
        promptTextTokens: perMillion(5),
        promptCachedTokens: perMillion(0.5),
        promptCacheWriteTokens: perMillion(6.25),
        completionTextTokens: perMillion(25),
    },
    title: "Claude Opus 5",
    description:
        "Frontier reasoning for coding, complex analysis and long-running agents",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
