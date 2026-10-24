import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "meta/llama-4-scout:openrouter:deepinfra-fp8-priority";
export const parent = "meta/llama-4-scout";
export const order = 0;

export default {
    provider: "openrouter",
    addedDate: new Date("2026-10-19").getTime(),
    // DeepInfra FP8 priority, verified 2026-10-19. Callers keep the
    // primary quote; Pollinations absorbs the higher route cost.
    cost: {
        promptTextTokens: perMillion(0.15) * 1.055,
        promptImageTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(0.45) * 1.055,
    },
} satisfies FallbackDefinition;
