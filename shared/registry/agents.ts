import { defineCostVariants, longContextAbove } from "./cost-variants";
import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

/** Pollinations-owned prompt agents served directly by Gen. */
export const AGENT_SERVICES = {
    midijourney: {
        aliases: ["midijourney-large"],
        provider: "azure",
        brand: "Pollinations",
        category: "text",
        addedDate: new Date("2025-10-07").getTime(),
        priceMultiplier: 0.5,
        cost: {
            promptTextTokens: perMillion(5.0),
            promptCachedTokens: perMillion(0.5),
            promptCacheWriteTokens: perMillion(6.25),
            completionTextTokens: perMillion(30.0),
        },
        ...defineCostVariants(
            {
                long_context: {
                    promptTextTokens: perMillion(10.0),
                    promptCachedTokens: perMillion(1.0),
                    promptCacheWriteTokens: perMillion(12.5),
                    completionTextTokens: perMillion(45.0),
                },
            },
            longContextAbove(272_000),
            {
                long_context: {
                    label: "Long context (>272K)",
                    description:
                        "More than 272,000 prompt tokens; the higher rates apply to the full request.",
                },
            },
            "≤272K context",
        ),
        title: "MIDIjourney",
        description: "Turns musical ideas into playable MIDI notation",
        inputModalities: ["text"],
        outputModalities: ["text"],
        tools: true,
        isSpecialized: true,
        agent: true,
        baseModel: "gpt-5.6-sol",
    },
} as const satisfies Record<string, ModelDefinition>;
