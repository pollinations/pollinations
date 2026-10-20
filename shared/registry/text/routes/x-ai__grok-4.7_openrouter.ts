import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "x-ai/grok-4.7:openrouter";
export const parent = "x-ai/grok-4.7";

export default {
    provider: "openrouter",
    addedDate: new Date("2026-10-12").getTime(),
    // OpenRouter base xAI rates (2026-10-12), including the account's
    // 5.5% credit-purchase fee. Images are tokenized into text tokens.
    cost: {
        promptTextTokens: perMillion(2) * 1.055,
        promptCachedTokens: perMillion(0.5) * 1.055,
        completionTextTokens: perMillion(6) * 1.055,
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(4) * 1.055,
                promptCachedTokens: perMillion(1) * 1.055,
                completionTextTokens: perMillion(12) * 1.055,
            },
        },
        longContextAtLeast(200_000),
        {
            long_context: {
                label: "Long context (≥200K)",
                description:
                    "xAI doubles text, cached, and output rates for the whole request.",
            },
        },
        "<200K context",
    ),
} satisfies FallbackDefinition;
