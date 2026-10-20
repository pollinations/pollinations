import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import { openRouterGeminiBilling } from "../../gemini-billing";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3.1-pro-preview:openrouter:vertex-global";
export const parent = "google/gemini-3.1-pro-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.gemini3,
    provider: "openrouter",
    priceMultiplier: 1,
    addedDate: new Date("2026-09-21").getTime(),
    cost: {
        promptTextTokens: perMillion(2.0) * 1.055,
        promptCachedTokens: perMillion(0.2) * 1.055,
        promptCacheWriteTokens: perMillion(2.0) * 1.055,
        promptAudioTokens: perMillion(2.0) * 1.055,
        promptImageTokens: perMillion(2.0) * 1.055,
        promptVideoTokens: perMillion(2.0) * 1.055,
        completionTextTokens: perMillion(12.0) * 1.055,
    },
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(4.0) * 1.055,
                promptCachedTokens: perMillion(0.4) * 1.055,
                promptCacheWriteTokens: perMillion(4.0) * 1.055,
                promptAudioTokens: perMillion(4.0) * 1.055,
                promptImageTokens: perMillion(4.0) * 1.055,
                promptVideoTokens: perMillion(4.0) * 1.055,
                completionTextTokens: perMillion(18.0) * 1.055,
            },
        },
        longContextAtLeast(200_000),
        {
            long_context: {
                label: "Long context (200K+)",
                description:
                    "At least 200,000 prompt tokens; text, cached, cache-write, image, audio, video, and output rates increase.",
            },
        },
        "<200K context",
    ),
    billing: openRouterGeminiBilling({
        searchCostPerThousandRequests: 14 * 1.055,
        storageCostPerMillionTokenHours: 4.5 * 1.055,
    }),
} satisfies FallbackDefinition;
