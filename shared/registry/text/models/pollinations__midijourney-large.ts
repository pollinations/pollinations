import { defineCostVariants, longContextAbove } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "pollinations/midijourney-large";

export default {
    supportedParameters: CHAT_PARAMETERS.azureGpt,
    aliases: ["midijourney-large"],
    provider: "azure",
    publisher: "Pollinations",
    category: "text",
    addedDate: new Date("2026-03-23").getTime(),
    // Its Azure gpt-5.5 route.
    // Provider retires this route on 2027-10-26.
    priceMultiplier: 0.75,
    paidOnly: false,
    cost: {
        promptTextTokens: perMillion(5.0),
        promptCachedTokens: perMillion(0.5),
        completionTextTokens: perMillion(30.0),
    },
    // Uses the same Azure GPT-5.5 deployment as openai-large.
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
    title: "MIDIjourney Large",
    description:
        "Composes richer, more detailed MIDI arrangements; costs more per piece",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: true,
    isSpecialized: true,
} satisfies ModelDefinition;
