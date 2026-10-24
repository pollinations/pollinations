import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-6-luna-decisions";

export default {
    supportedParameters: CHAT_PARAMETERS.typesafeJev,
    aliases: [],
    provider: "openai",
    publisher: "OpenAI",
    category: "decision",
    addedDate: new Date("2026-10-07").getTime(),
    priceMultiplier: 1, // Public pricing follows the direct OpenAI rate.
    paidOnly: true,
    cost: {
        // Direct OpenAI Decisions: $0.10/M input through 272K tokens.
        // Output and cache are free; the long-context tier is below.
        promptTextTokens: perMillion(0.1),
        completionTextTokens: perMillion(0),
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(0.2),
                completionTextTokens: perMillion(0),
            },
        },
        longContextAbove(272_000),
        {
            long_context: {
                label: "Long context (>272K)",
                description:
                    "More than 272,000 input tokens; OpenAI doubles the input rate for the full request.",
            },
        },
        "≤272K context",
        [
            {
                key: "context",
                label: "Context",
                unit: "tokens",
                values: { "": "≤272K", long_context: ">272K" },
            },
        ],
    ),
    title: "GPT-6 Luna Decisions",
    description:
        "Typed answers with probabilities and confidence instead of " +
        "generated text, billed on input tokens only; post state and " +
        "questions to /alpha/decisions, or send the same JSON in the " +
        "last user message on /v1/chat/completions. Text state only",
    // Same request shape as Jev: decisions route and chat adapter only.
    supportedEndpoints: ["/alpha/decisions", "/v1/chat/completions"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: false,
    reasoning: false,
    contextLength: 1050000,
    isSpecialized: true,
} satisfies ModelDefinition;
