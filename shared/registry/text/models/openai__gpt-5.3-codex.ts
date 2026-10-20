import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.3-codex";

export default {
    supportedParameters: CHAT_PARAMETERS.azureResponses,
    aliases: [],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-09-22").getTime(),
    // Provider retires this route on 2027-08-24.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(1.75),
        promptCachedTokens: perMillion(0.175),
        // Azure exposes cache writes as an input-token subtype and has no
        // separate Global Standard write meter for this checkpoint.
        promptCacheWriteTokens: perMillion(1.75),
        completionTextTokens: perMillion(14),
    },
    title: "GPT-5.3 Codex",
    description:
        "Coding-focused reasoner for complex software engineering and agentic tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxCompletionTokens: 128000,
    tools: true,
    reasoning: true,
    contextLength: 400000,
    isSpecialized: true,
} satisfies ModelDefinition;
