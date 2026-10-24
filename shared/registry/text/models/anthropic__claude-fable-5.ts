import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-fable-5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoSampling,
    aliases: ["claude-fable-5"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-06-11").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // Bedrock global.anthropic.claude-fable-5 global standard rates.
        promptTextTokens: perMillion(10),
        promptCachedTokens: perMillion(1),
        promptCacheWriteTokens: perMillion(12.5),
        completionTextTokens: perMillion(50),
    },
    title: "Claude Fable 5",
    description:
        "Frontier intelligence for complex reasoning and long agentic work; the priciest tier",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
