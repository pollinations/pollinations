import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "x-ai/grok-4.3:openrouter:xai-zdr";
export const parent = "x-ai/grok-4.3";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGrok43,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(1.25) * 1.055,
        promptCachedTokens: perMillion(0.2) * 1.055,
        promptImageTokens: perMillion(1.25) * 1.055,
        completionTextTokens: perMillion(2.5) * 1.055,
    },
} satisfies FallbackDefinition;
