import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "google/gemini-2.5-flash-image:openrouter:vertex-global";
export const parent = "google/gemini-2.5-flash-image";
export const order = 0;

export default {
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    // OpenRouter expiration_date.
    // Provider retires this route on 2027-03-15.
    cost: {
        promptTextTokens: perMillion(0.3) * 1.055,
        promptImageTokens: perMillion(0.3) * 1.055,
        completionTextTokens: perMillion(2.5) * 1.055,
        completionImageTokens: perMillion(30) * 1.055,
    },
} satisfies FallbackDefinition;
