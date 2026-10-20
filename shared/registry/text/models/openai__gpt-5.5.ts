import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "openai/gpt-5.5";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGpt,
    aliases: [
        "gpt-5.5",
        "gpt-5.5-reasoning",
        "openai-reasoning",
        "openai-large",
    ],
    provider: "azure",
    publisher: "OpenAI",
    category: "text",
    addedDate: new Date("2026-05-02").getTime(),
    // Provider retires this route on 2027-10-26.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(5.0),
        promptCachedTokens: perMillion(0.5),
        completionTextTokens: perMillion(30.0),
    },
    // GPT-5.5 documents strict >272K whole-request repricing; Azure's
    // LongCo global meters are $10/$1/$45 per M.
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(10.0),
                promptCachedTokens: perMillion(1.0),
                completionTextTokens: perMillion(45.0),
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
    title: "GPT-5.5",
    description:
        "Frontier reasoning for complex, multi-step problems; takes its time thinking",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10, // Azure OpenAI vision limit: 10 images/chat request (provider cap).
    tools: true,
    reasoning: true,
    contextLength: 1050000,
    isSpecialized: false,
} satisfies ModelDefinition;
