import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "tencent/hy3:openrouter:phala";
export const parent = "tencent/hy3";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterHy3Phala,
    provider: "openrouter",
    addedDate: new Date("2026-09-18").getTime(),
    // Phala route rates (2026-09-18, includes the mandatory 5.5%
    // OpenRouter credit fee); distinct provider from the Novita
    // primary, and the highest uptime of Hy3's six endpoints
    // (99.97%), with low latency (~1.6-2.5s) in local E2E testing.
    cost: {
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.04) * 1.055,
        completionTextTokens: perMillion(0.64) * 1.055,
    },
} satisfies FallbackDefinition;
