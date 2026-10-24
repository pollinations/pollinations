import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-haiku-4.5:openrouter:vertex-global";
export const parent = "anthropic/claude-haiku-4.5";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterHaiku,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(1) * 1.055,
        promptCachedTokens: perMillion(0.1) * 1.055,
        promptCacheWriteTokens: perMillion(1.25) * 1.055,
        completionTextTokens: perMillion(5) * 1.055,
    },
} satisfies FallbackDefinition;
