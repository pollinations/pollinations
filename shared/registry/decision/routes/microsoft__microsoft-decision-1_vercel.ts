import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same Azure backend; covers gateway failures, not Microsoft outages.

export const id = "microsoft/microsoft-decision-1:vercel";
export const parent = "microsoft/microsoft-decision-1";
export const order = 0;

export default {
    provider: "vercel",
    // Vercel AI Gateway list price, the cheapest route.
    cost: {
        promptTextTokens: perMillion(0.042),
        completionTextTokens: perMillion(0),
    },
} satisfies FallbackDefinition;
