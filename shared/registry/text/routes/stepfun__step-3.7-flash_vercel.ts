import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

// StepFun's own endpoint through Vercel's AI Gateway at the posted base rates.

export const id = "stepfun/step-3.7-flash:vercel";
export const parent = "stepfun/step-3.7-flash";
export const order = 0;

export default {
    provider: "vercel",
    cost: {
        promptTextTokens: perMillion(0.2),
        promptCachedTokens: perMillion(0.04),
        completionTextTokens: perMillion(1.15),
    },
} satisfies FallbackDefinition;
