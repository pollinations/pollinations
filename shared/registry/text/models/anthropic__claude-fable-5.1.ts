import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-fable-5.1";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoForcedTools,
    aliases: [],
    provider: "anthropic",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-09-01").getTime(),
    paidOnly: true,
    priceMultiplier: 0.75,
    cost: {
        // Anthropic global standard rates; 5-minute cache writes.
        promptTextTokens: perMillion(10),
        promptCachedTokens: perMillion(0.25),
        promptCacheWriteTokens: perMillion(12.5),
        completionTextTokens: perMillion(50),
    },
    title: "Claude Fable 5.1",
    description:
        "Frontier intelligence for complex reasoning, coding and long-running agents",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Preserve the image limit across the AWS fallback.
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
