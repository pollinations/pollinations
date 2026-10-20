import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.20:openrouter:xai-zdr";
export const parent = "x-ai/grok-4.20";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGrok420,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(1.25) * 1.055,
        promptCachedTokens: perMillion(0.2) * 1.055,
        promptImageTokens: perMillion(1.25) * 1.055,
        completionTextTokens: perMillion(2.5) * 1.055,
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(2.5) * 1.055,
                promptCachedTokens: perMillion(0.4) * 1.055,
                promptImageTokens: perMillion(2.5) * 1.055,
                completionTextTokens: perMillion(5) * 1.055,
            },
        },
        longContextAtLeast(200_000),
        {
            long_context: {
                label: "Long context (≥200K)",
                description:
                    "OpenRouter xAI long-context pricing applies to the whole request.",
            },
        },
        "<200K context",
    ),
} satisfies FallbackDefinition;
