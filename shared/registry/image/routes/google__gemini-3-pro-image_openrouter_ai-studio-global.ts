import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "google/gemini-3-pro-image:openrouter:ai-studio-global";
export const parent = "google/gemini-3-pro-image";
export const order = 0;

export default {
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(2) * 1.055,
        promptImageTokens: perMillion(2) * 1.055,
        completionTextTokens: perMillion(12) * 1.055,
        completionImageTokens: perMillion(120) * 1.055,
    },
} satisfies FallbackDefinition;
