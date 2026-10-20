import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "liquid/d1";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: [],
    provider: "openrouter",
    publisher: "Liquid AI",
    category: "text",
    addedDate: new Date("2026-10-02").getTime(),
    priceMultiplier: 1, // Billed at cost, no margin.
    paidOnly: true,
    cost: {
        // OpenRouter list price ($0.02/M input and cached input) plus its
        // 5.5% credit fee, as every OpenRouter route records.
        promptTextTokens: perMillion(0.02) * 1.055,
        promptCachedTokens: perMillion(0.02) * 1.055,
        completionTextTokens: perMillion(0),
    },
    title: "Liquid D1",
    description:
        "Structured decision model that returns typed choices, scores " +
        "and probabilities; post state and questions to " +
        "/alpha/decisions, or send the same JSON in the last user " +
        "message on /v1/chat/completions",
    // Same request shape as Jev: decisions route and chat adapter only.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    contextLength: 65536,
    isSpecialized: true,
} satisfies ModelDefinition;
