import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16";
export const parent = "nvidia/nemotron-3.5-lightning";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterNemotron,
    provider: "openrouter",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        // OpenRouter CoreWeave BF16 rates (2026-09-21), including the
        // account's 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.07) * 1.055,
        promptCachedTokens: perMillion(0.04) * 1.055,
        completionTextTokens: perMillion(0.2) * 1.055,
    },
} satisfies FallbackDefinition;
