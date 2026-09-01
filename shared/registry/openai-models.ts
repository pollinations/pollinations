import { defineCostVariants, longContextAbove } from "./cost-variants";
import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

const GPT_5_6_SOL_COST = {
    promptTextTokens: perMillion(5.0),
    promptCachedTokens: perMillion(0.5),
    promptCacheWriteTokens: perMillion(6.25),
    completionTextTokens: perMillion(30.0),
};

const GPT_5_6_SOL_COST_VARIANTS = defineCostVariants(
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
);

export const GPT_5_6_SOL_SERVICE = {
    aliases: ["chatgpt-sol", "chatgpt-5.6-sol", "openai/gpt-5.6-sol"],
    provider: "azure",
    brand: "OpenAI",
    category: "text",
    addedDate: new Date("2026-07-10").getTime(),
    // OpenRouter's standard OpenAI endpoint discounts Azure output more
    // deeply than input/cache. One third matches its output rate and keeps
    // the other dimensions below that endpoint under a uniform multiplier.
    priceMultiplier: 1 / 3,
    cost: GPT_5_6_SOL_COST,
    ...GPT_5_6_SOL_COST_VARIANTS,
    title: "GPT-5.6 Sol",
    description: "Frontier reasoning for complex multimodal tasks",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    tools: true,
    reasoning: true,
    contextLength: 1050000,
} satisfies ModelDefinition;
