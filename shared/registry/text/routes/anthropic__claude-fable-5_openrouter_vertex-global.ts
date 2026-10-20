import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "anthropic/claude-fable-5:openrouter:vertex-global";
export const parent = "anthropic/claude-fable-5";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterOpus,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(10) * 1.055,
        promptCachedTokens: perMillion(1) * 1.055,
        promptCacheWriteTokens: perMillion(12.5) * 1.055,
        completionTextTokens: perMillion(50) * 1.055,
    },
} satisfies FallbackDefinition;
