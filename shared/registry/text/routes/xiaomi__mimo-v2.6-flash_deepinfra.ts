import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "xiaomi/mimo-v2.6-flash:deepinfra";
export const parent = "xiaomi/mimo-v2.6-flash";

export default {
    provider: "deepinfra",
    addedDate: new Date("2026-10-10").getTime(),
    // DeepInfra direct (2026-10-10): base rates without OpenRouter's 5.5% fee.
    cost: {
        promptTextTokens: perMillion(0.14),
        promptCachedTokens: perMillion(0.0028),
        completionTextTokens: perMillion(0.28),
    },
} satisfies FallbackDefinition;
