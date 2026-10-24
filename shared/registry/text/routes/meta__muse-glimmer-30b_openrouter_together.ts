import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/muse-glimmer-30b:openrouter:together";
export const parent = "meta/muse-glimmer-30b";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterMuseGlimmer,
    provider: "openrouter",
    addedDate: new Date("2026-09-23").getTime(),
    cost: {
        // OpenRouter Together rates (2026-09-23), including the
        // account's 5.5% credit-purchase fee. Costs more than the
        // primary; Phala was cheaper but rate-limited bursts.
        promptTextTokens: perMillion(0.35) * 1.055,
        promptCachedTokens: perMillion(0.04) * 1.055,
        promptImageTokens: perMillion(0.35) * 1.055,
        completionTextTokens: perMillion(1.5) * 1.055,
    },
} satisfies FallbackDefinition;
