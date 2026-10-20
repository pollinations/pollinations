import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-sonnet-5";

export default {
    supportedParameters: CHAT_PARAMETERS.bedrockClaudeNoSampling,
    aliases: ["sonnet-5", "claude-sonnet-5"],
    provider: "aws",
    publisher: "Anthropic",
    category: "text",
    addedDate: new Date("2026-06-30").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    cost: {
        // AWS Price List global standard meters, published 2026-09-01T18:36:49Z.
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.2),
        promptCacheWriteTokens: perMillion(2.5),
        completionTextTokens: perMillion(10),
    },
    title: "Claude Sonnet 5",
    description:
        "Sharp reasoning with fast responses — a strong default for most work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 20, // Bedrock Converse image limit.
    tools: true,
    contextLength: 1000000, // Bedrock Claude Sonnet 5 context window.
    isSpecialized: false,
} satisfies ModelDefinition;
