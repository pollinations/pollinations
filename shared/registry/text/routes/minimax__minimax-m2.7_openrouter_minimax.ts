import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "minimax/minimax-m2.7:openrouter:minimax";
export const parent = "minimax/minimax-m2.7";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterMinimax27FirstParty,
    provider: "openrouter",
    addedDate: new Date("2026-09-23").getTime(),
    cost: {
        // OpenRouter MiniMax first-party FP8 rates (2026-09-23),
        // including the account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.3) * 1.055,
        promptCachedTokens: perMillion(0.06) * 1.055,
        completionTextTokens: perMillion(1.2) * 1.055,
    },
} satisfies FallbackDefinition;
