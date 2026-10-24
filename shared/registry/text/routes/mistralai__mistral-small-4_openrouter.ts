import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "mistralai/mistral-small-4:openrouter";
export const parent = "mistralai/mistral-small-4";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.015) * 1.055,
        promptImageTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(0.6) * 1.055,
    },
} satisfies FallbackDefinition;
