import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k2.6:deepinfra";
export const parent = "moonshotai/kimi-k2.6";
export const order = 1;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.75),
        promptCachedTokens: perMillion(0.15),
        promptImageTokens: perMillion(0.75),
        completionTextTokens: perMillion(3.5),
    },
} satisfies FallbackDefinition;
