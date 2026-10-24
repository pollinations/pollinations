import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "google/gemini-3.1-flash-lite-image:openrouter:vertex-global";
export const parent = "google/gemini-3.1-flash-lite-image";
export const order = 0;

export default {
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(0.25) * 1.055,
        promptImageTokens: perMillion(0.25) * 1.055,
        completionTextTokens: perMillion(1.5) * 1.055,
        completionImageTokens: perMillion(30) * 1.055,
    },
} satisfies FallbackDefinition;
