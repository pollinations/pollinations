import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "inclusionai/ling-3.1-flash:vercel:novita";
export const parent = "inclusionai/ling-3.1-flash";

export default {
    provider: "vercel",
    // Same Novita checkpoint through a separate gateway, which adds
    // no fee. Vercel still listed it free on 2026-10-13.
    cost: {
        promptTextTokens: perMillion(0.3),
        promptCachedTokens: perMillion(0.06),
        completionTextTokens: perMillion(0.9),
    },
} satisfies FallbackDefinition;
