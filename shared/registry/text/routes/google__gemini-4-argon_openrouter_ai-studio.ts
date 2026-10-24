import { openRouterGeminiBilling } from "../../gemini-billing";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-4-argon:openrouter:ai-studio";
export const parent = "google/gemini-4-argon";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.gemini35AiStudio,
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-10-13").getTime(),
    // OpenRouter Google AI Studio list rates (2026-10-13; its 50% promo
    // through 2026-11-30 is not counted), including the 5.5%
    // credit-purchase fee, so this route costs 5.5% above the price.
    cost: {
        promptTextTokens: perMillion(4) * 1.055,
        promptCachedTokens: perMillion(0.2) * 1.055,
        promptCacheWriteTokens: perMillion(4) * 1.055,
        promptAudioTokens: perMillion(4) * 1.055,
        promptImageTokens: perMillion(4) * 1.055,
        promptVideoTokens: perMillion(4) * 1.055,
        completionTextTokens: perMillion(20) * 1.055,
    },
    // Implicit caching only, so no explicit cache storage is billed.
    billing: openRouterGeminiBilling({
        searchCostPerThousandRequests: 14 * 1.055,
        storageCostPerMillionTokenHours: 0,
    }),
} satisfies FallbackDefinition;
