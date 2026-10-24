import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "respan/span-01-lite";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: [],
    provider: "openrouter",
    publisher: "Respan",
    category: "decision",
    addedDate: new Date("2026-09-30").getTime(),
    priceMultiplier: 1, // Free upstream, so billed at zero.
    // Free upstream, so Quest Pollen can reach it at no cost.
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(0),
        completionTextTokens: perMillion(0),
    },
    title: "Span-01 Lite",
    description:
        "Free behaviour scoring: the probability that plain-language " +
        "behaviours are present in an agent or LLM conversation. Accepts " +
        "only noul questions with plain-string instructions, and Respan " +
        "retains prompts (no training). Post state and questions to " +
        "/alpha/decisions, or send the same JSON in the last user " +
        "message on /v1/chat/completions",
    // Same request shape as Jev: decisions route and chat adapter only.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    isSpecialized: true,
} satisfies ModelDefinition;
