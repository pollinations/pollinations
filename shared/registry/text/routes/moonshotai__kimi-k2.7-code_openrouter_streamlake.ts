import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k2.7-code:openrouter:streamlake";
export const parent = "moonshotai/kimi-k2.7-code";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterKimiStreamLake,
    provider: "openrouter",
    addedDate: new Date("2026-09-23").getTime(),
    cost: {
        // OpenRouter StreamLake promo rates (2026-09-23; list
        // $0.95/$4.00), including the account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.7125) * 1.055,
        promptCachedTokens: perMillion(0.1425) * 1.055,
        promptCacheWriteTokens: perMillion(0.7125) * 1.055,
        promptImageTokens: perMillion(0.7125) * 1.055,
        completionTextTokens: perMillion(3.0) * 1.055,
    },
} satisfies FallbackDefinition;
