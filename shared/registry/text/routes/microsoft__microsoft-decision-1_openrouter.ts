import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same Azure backend; covers gateway failures, not Microsoft outages.

export const id = "microsoft/microsoft-decision-1:openrouter";
export const parent = "microsoft/microsoft-decision-1";
export const order = 0;

export default {
    provider: "openrouter",
    // OpenRouter list price plus its 5.5% credit fee.
    cost: {
        promptTextTokens: perMillion(0.042) * 1.055,
        completionTextTokens: perMillion(0),
    },
} satisfies FallbackDefinition;
