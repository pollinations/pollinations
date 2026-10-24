import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "microsoft/microsoft-decision-1";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: [],
    provider: "azure",
    publisher: "Microsoft",
    category: "decision",
    addedDate: new Date("2026-10-09").getTime(),
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        // Azure Retail Prices "Microsoft Decision 1 1M Tokens" (2026-10-23),
        // the model's only meter.
        promptTextTokens: perMillion(0.042),
        completionTextTokens: perMillion(0),
    },
    title: "Microsoft-Decision-1",
    description:
        "Fast typed choices with a calibrated probability for each fixed " +
        "option and no generated text; post state and questions to " +
        "/alpha/decisions, or send the same JSON in the last user " +
        "message on /v1/chat/completions",
    // Same request shape as Jev: decisions route and chat adapter only.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    contextLength: 32768,
    isSpecialized: true,
} satisfies ModelDefinition;
