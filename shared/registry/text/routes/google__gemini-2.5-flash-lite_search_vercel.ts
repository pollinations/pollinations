import { VERCEL_EXA_SEARCH_BILLING } from "../../gemini-billing";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "google/gemini-2.5-flash-lite:search:vercel";
export const parent = "google/gemini-2.5-flash-lite:search";

export default {
    provider: "vercel",
    cost: {
        promptTextTokens: perMillion(0.1),
        promptCachedTokens: perMillion(0.01),
        promptCacheWriteTokens: perMillion(0.1),
        promptAudioTokens: perMillion(0.1),
        promptImageTokens: perMillion(0.1),
        promptVideoTokens: perMillion(0.1),
        completionTextTokens: perMillion(0.4),
    },
    billing: VERCEL_EXA_SEARCH_BILLING,
} satisfies FallbackDefinition;
