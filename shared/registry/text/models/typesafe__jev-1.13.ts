import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "typesafe/jev-1.13";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: ["jev", "typesafe/jev"],
    provider: "openrouter",
    publisher: "TypeSafe",
    category: "text",
    addedDate: new Date("2026-09-17").getTime(),
    priceMultiplier: 1, // Billed at cost, no margin.
    paidOnly: true,
    cost: {
        // TypeSafe list price (docs.typesafe.ai, checked 2026-09-17) plus
        // OpenRouter's 5.5% credit fee, as every OpenRouter route records.
        promptTextTokens: perMillion(0.042) * 1.055,
        completionTextTokens: perMillion(0),
    },
    title: "Jev",
    description:
        "Typed decisions with calibrated confidence instead of free text; " +
        "post state and questions to /alpha/decisions, or send the same " +
        "JSON in the last user message on /v1/chat/completions",
    // Its own request shape, so it is offered on the decisions route and
    // the chat adapter only — /text returns plain content and has nothing
    // to return here.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    // 64k for state + questions together; 32k for state + the longest
    // question. https://docs.typesafe.ai/model-jaggedness/jev-1.13
    contextLength: 64000,
    isSpecialized: true,
} satisfies ModelDefinition;
