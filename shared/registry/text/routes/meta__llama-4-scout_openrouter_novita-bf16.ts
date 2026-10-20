import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "meta/llama-4-scout:openrouter:novita-bf16";
export const parent = "meta/llama-4-scout";

export default {
    provider: "openrouter",
    addedDate: new Date("2026-09-15").getTime(),
    // OpenRouter Novita BF16, verified 2026-09-15. Callers retain the
    // DeepInfra quote; Pollinations absorbs the higher fallback cost.
    cost: {
        promptTextTokens: perMillion(0.18) * 1.055,
        promptImageTokens: perMillion(0.18) * 1.055,
        completionTextTokens: perMillion(0.59) * 1.055,
    },
} satisfies FallbackDefinition;
