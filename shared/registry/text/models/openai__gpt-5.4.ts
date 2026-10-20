import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.4";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGpt54,
    aliases: ["gpt-5.4-reasoning", "gpt-5.2", "gpt-5.2-reasoning", "gpt-5.4"],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2025-10-07").getTime(),
    // Provider retires this route on 2027-09-02.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(2.5),
        promptCachedTokens: perMillion(0.25),
        completionTextTokens: perMillion(15.0),
    },
    // Azure meters GPT-5.4 as separate "<272k" / ">272k context length"
    // SKUs — the whole request bills at one tier (2x input & cached,
    // 1.5x output). Verified against azure.microsoft.com/pricing and the
    // Retail Prices API ("5.4 longco *" meters), 2026-07-22.
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(5.0),
                promptCachedTokens: perMillion(0.5),
                completionTextTokens: perMillion(22.5),
            },
        },
        longContextAbove(272_000),
        {
            long_context: {
                label: "Long context (>272K)",
                description:
                    "More than 272,000 prompt tokens; the higher rates apply to the whole request.",
            },
        },
        "≤272K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "≤272K",
                    "long_context": ">272K",
                },
            },
        ],
    ),
    title: "GPT-5.4",
    description:
        "Deep reasoning for the hardest questions; slower and pricier than lighter tiers",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Azure OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
