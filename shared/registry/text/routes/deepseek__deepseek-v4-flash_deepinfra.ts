import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4-flash:deepinfra";
export const parent = "deepseek/deepseek-v4-flash";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        // DeepInfra standard-tier rates (2026-09-21).
        promptTextTokens: perMillion(0.06),
        promptCachedTokens: perMillion(0.015),
        completionTextTokens: perMillion(0.18),
    },
} satisfies FallbackDefinition;
