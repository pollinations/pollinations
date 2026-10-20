import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "xiaomi/mimo-v2.6-pro:deepinfra";
export const parent = "xiaomi/mimo-v2.6-pro";

export default {
    provider: "deepinfra",
    addedDate: new Date("2026-10-10").getTime(),
    // DeepInfra bills input at $0.43 per 1M; the public price stays at Novita's $0.435.
    cost: {
        promptTextTokens: perMillion(0.43),
        promptCachedTokens: perMillion(0.0036),
        completionTextTokens: perMillion(0.87),
    },
} satisfies FallbackDefinition;
