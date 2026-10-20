import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same Perplexity backend; covers gateway failures, not Perplexity outages.

export const id = "perplexity/pplx-decider-v1.1-27b:openrouter";
export const parent = "perplexity/pplx-decider-v1.1-27b";

export default {
    provider: "openrouter",
    // OpenRouter list price plus its 5.5% credit fee.
    cost: {
        promptTextTokens: perMillion(0.02) * 1.055,
        completionTextTokens: perMillion(0),
    },
} satisfies FallbackDefinition;
