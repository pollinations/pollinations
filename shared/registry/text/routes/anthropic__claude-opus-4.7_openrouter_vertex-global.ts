import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-opus-4.7:openrouter:vertex-global";
export const parent = "anthropic/claude-opus-4.7";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterOpus,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(5) * 1.055,
        promptCachedTokens: perMillion(0.5) * 1.055,
        promptCacheWriteTokens: perMillion(6.25) * 1.055,
        completionTextTokens: perMillion(25) * 1.055,
    },
} satisfies FallbackDefinition;
