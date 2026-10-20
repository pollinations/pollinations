import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-5.5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoForcedTools,
    aliases: [],
    provider: "anthropic",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-09-22").getTime(),
    paidOnly: true,
    priceMultiplier: 0.75,
    // Anthropic global standard rates; 5-minute cache writes.
    cost: {
        promptTextTokens: perMillion(4),
        promptCachedTokens: perMillion(0.2),
        promptCacheWriteTokens: perMillion(5),
        completionTextTokens: perMillion(20),
    },
    title: "Claude Opus 5.5",
    description:
        "Flagship reasoning for demanding coding, multi-step codebase changes and long-horizon agentic work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Preserve the image limit across the AWS fallback.
    tools: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
