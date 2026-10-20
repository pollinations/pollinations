import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// Same StepFun model through Vercel's AI Gateway at the posted base
// rates, without OpenRouter's credit fee.

export const id = "stepfun/step-5-preview:vercel";
export const parent = "stepfun/step-5-preview";
export const order = 0;

export default {
    provider: "vercel",
    cost: {
        promptTextTokens: perMillion(1),
        promptCachedTokens: perMillion(0.05),
        completionTextTokens: perMillion(2.7),
    },
} satisfies FallbackDefinition;
