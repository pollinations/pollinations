import { defineCostVariants, longContextAbove } from "./cost-variants";
import { perMillion } from "./price-helpers";

export const GPT_5_6_SOL_COST = {
    promptTextTokens: perMillion(5.0),
    promptCachedTokens: perMillion(0.5),
    promptCacheWriteTokens: perMillion(6.25),
    completionTextTokens: perMillion(30.0),
};

export const GPT_5_6_SOL_COST_VARIANTS = defineCostVariants(
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
