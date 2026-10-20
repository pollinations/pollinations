import { openRouterGeminiBilling } from "../../gemini-billing";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3.7-flash:openrouter:vertex-global";
export const parent = "google/gemini-3.7-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.gemini35,
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(0.75) * 1.055,
        promptCachedTokens: perMillion(0.075) * 1.055,
        promptCacheWriteTokens: perMillion(0.75) * 1.055,
        promptAudioTokens: perMillion(0.75) * 1.055,
        promptImageTokens: perMillion(0.75) * 1.055,
        promptVideoTokens: perMillion(0.75) * 1.055,
        completionTextTokens: perMillion(3.75) * 1.055,
    },
    billing: openRouterGeminiBilling({
        searchCostPerThousandRequests: 14 * 1.055,
        storageCostPerMillionTokenHours: 0.5 * 1.055,
    }),
} satisfies FallbackDefinition;
