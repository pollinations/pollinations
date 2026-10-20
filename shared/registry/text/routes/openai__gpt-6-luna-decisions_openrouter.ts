import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same OpenAI backend; covers direct-route failures, not OpenAI outages.

export const id = "openai/gpt-6-luna-decisions:openrouter";
export const parent = "openai/gpt-6-luna-decisions";
export const order = 0;

export default {
    provider: "openrouter",
    cost: {
        promptTextTokens: perMillion(0.1) * 1.055,
        completionTextTokens: perMillion(0),
    },
    // OpenRouter's flat rate must not inherit OpenAI's context tier.
    costVariants: undefined,
    selectCostVariant: undefined,
    costVariantMetadata: undefined,
    defaultCostVariantLabel: undefined,
    pricingDimensions: undefined,
} satisfies FallbackDefinition;
