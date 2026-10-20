import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "x-ai/grok-4.6:xai";
export const parent = "x-ai/grok-4.6";

export default {
    provider: "xai",
    addedDate: new Date("2026-09-24").getTime(),
    // xAI /v1/language-models/grok-4.6 rates (2026-09-24). Image tokens
    // bill at the text input rate; reasoning bills as output.
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.5),
        promptImageTokens: perMillion(2),
        completionTextTokens: perMillion(6),
    },
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
                label: "Long context (≥200K)",
                description:
                    "xAI doubles text, cached, image, and output rates for the whole request.",
            },
        },
        "<200K context",
    ),
} satisfies FallbackDefinition;
