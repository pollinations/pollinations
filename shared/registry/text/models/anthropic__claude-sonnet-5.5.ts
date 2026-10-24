import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-sonnet-5.5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoForcedTools,
    aliases: [],
    provider: "anthropic",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-09-28").getTime(),
    paidOnly: true,
    priceMultiplier: 0.75,
    cost: {
        // Anthropic global standard rates; 5-minute cache writes.
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.1),
        promptCacheWriteTokens: perMillion(2.5),
        completionTextTokens: perMillion(10),
    },
    title: "Claude Sonnet 5.5",
    description:
        "Fast adaptive reasoning for everyday coding, agentic tool use and long-context work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Preserve the image limit across the AWS fallback.
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
