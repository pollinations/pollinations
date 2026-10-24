import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "perplexity/pplx-decider-v1.2";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    // Perplexity retired V1.1 in favour of V1.2.
    aliases: ["perplexity/pplx-decider-v1.1-27b"],
    provider: "vercel",
    publisher: "Perplexity",
    category: "decision",
    addedDate: new Date("2026-10-24").getTime(),
    priceMultiplier: 1, // Billed at cost, no margin.
    paidOnly: true,
    cost: {
        // Vercel AI Gateway list price, the cheapest route.
        promptTextTokens: perMillion(0.02),
        completionTextTokens: perMillion(0),
    },
    title: "Decider V1.2 27B",
    description:
        "Typed choices, scores and yes/no probabilities over a 262K " +
        "context; post state and questions to /alpha/decisions, or send " +
        "the same JSON in the last user message on /v1/chat/completions. " +
        "Text state only",
    // Same request shape as Jev: decisions route and chat adapter only.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    contextLength: 262144,
    isSpecialized: true,
} satisfies ModelDefinition;
