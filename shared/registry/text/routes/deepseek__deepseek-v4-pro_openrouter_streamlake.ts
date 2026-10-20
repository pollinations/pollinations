import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4-pro:openrouter:streamlake";
export const parent = "deepseek/deepseek-v4-pro";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterStreamLakeReasoning,
    provider: "openrouter",
    addedDate: new Date("2026-09-23").getTime(),
    cost: {
        // OpenRouter StreamLake 50% promo rates (2026-10-12; list
        // $1.32/$0.044/$3.96, no published end date), including the
        // account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.66) * 1.055,
        promptCachedTokens: perMillion(0.022) * 1.055,
        completionTextTokens: perMillion(1.98) * 1.055,
    },
} satisfies FallbackDefinition;
