import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3:openrouter:friendli";
export const parent = "z-ai/glm-5.3";
export const order = 1;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGlm53,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(1.26) * 1.055,
        promptCachedTokens: perMillion(0.234) * 1.055,
        completionTextTokens: perMillion(3.96) * 1.055,
    },
} satisfies FallbackDefinition;
