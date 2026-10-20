import { openRouterGeminiBilling } from "../../gemini-billing";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-2.5-flash-lite:openrouter:ai-studio";
export const parent = "google/gemini-2.5-flash-lite";

export default {
    supportedParameters: CHAT_PARAMETERS.gemini25,
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(0.1) * 1.055,
        promptCachedTokens: perMillion(0.01) * 1.055,
        promptCacheWriteTokens: perMillion(0.1) * 1.055,
        promptAudioTokens: perMillion(0.3) * 1.055,
        promptImageTokens: perMillion(0.1) * 1.055,
        promptVideoTokens: perMillion(0.1) * 1.055,
        completionTextTokens: perMillion(0.4) * 1.055,
    },
    billing: openRouterGeminiBilling({
        searchCostPerThousandRequests: 14 * 1.055,
        storageCostPerMillionTokenHours: 1.0 * 1.055,
    }),
} satisfies FallbackDefinition;
