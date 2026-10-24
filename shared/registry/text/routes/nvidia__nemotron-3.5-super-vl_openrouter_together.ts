import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3.5-super-vl:openrouter:together";
export const parent = "nvidia/nemotron-3.5-super-vl";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterNemotronSuperVl,
    provider: "openrouter",
    addedDate: new Date("2026-10-15").getTime(),
    cost: {
        // OpenRouter Together rates (2026-10-15), including the account's
        // 5.5% credit-purchase fee.
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.02) * 1.055,
        completionTextTokens: perMillion(0.5) * 1.055,
    },
} satisfies FallbackDefinition;
