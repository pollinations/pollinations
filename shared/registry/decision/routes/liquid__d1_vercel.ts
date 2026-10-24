import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same Liquid backend; this covers gateway failures, not Liquid outages.

export const id = "liquid/d1:vercel";
export const parent = "liquid/d1";
export const order = 0;

export default {
    provider: "vercel",
    // Vercel AI Gateway list price for the Liquid endpoint.
    cost: {
        promptTextTokens: perMillion(0.02),
        completionTextTokens: perMillion(0),
    },
} satisfies FallbackDefinition;
