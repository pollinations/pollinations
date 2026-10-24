import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.7";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGrok47,
    aliases: [],
    provider: "xai",
    publisher: "xAI",
    category: "text",
    addedDate: new Date("2026-09-21").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    // xAI /v1/language-models/grok-4.7 rates (2026-10-12). Image tokens
    // bill at the text input rate; reasoning bills as output. Excludes the
    // $0.005-per-call web search charge (not exposed on this model).
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.5),
        promptImageTokens: perMillion(2),
        completionTextTokens: perMillion(6),
    },
    // xAI reprices the whole request from 200K prompt tokens.
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(4),
                promptCachedTokens: perMillion(1),
                promptImageTokens: perMillion(4),
                completionTextTokens: perMillion(12),
            },
        },
        longContextAtLeast(200_000),
        {
            long_context: {
                label: "Long context (200K+)",
                description:
                    "At least 200,000 prompt tokens; text, cached, and output rates double.",
            },
        },
        "<200K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "<200K",
                    "long_context": "≥200K",
                },
            },
        ],
    ),
    title: "Grok 4.7",
    description:
        "Frontier reasoning for long-running coding, agentic tasks, and knowledge work",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 500000,
    isSpecialized: false,
} satisfies ModelDefinition;
