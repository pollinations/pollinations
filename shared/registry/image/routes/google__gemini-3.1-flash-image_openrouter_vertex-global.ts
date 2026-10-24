import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "google/gemini-3.1-flash-image:openrouter:vertex-global";
export const parent = "google/gemini-3.1-flash-image";
export const order = 0;

export default {
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(0.5) * 1.055,
        promptImageTokens: perMillion(0.5) * 1.055,
        completionTextTokens: perMillion(3) * 1.055,
        completionImageTokens: perMillion(60) * 1.055,
    },
} satisfies FallbackDefinition;
