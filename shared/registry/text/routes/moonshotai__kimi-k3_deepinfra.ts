import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "moonshotai/kimi-k3:deepinfra";
export const parent = "moonshotai/kimi-k3";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    // https://deepinfra.com/moonshotai/Kimi-K3 (2026-10-07).
    cost: {
        promptTextTokens: perMillion(2.85),
        promptCachedTokens: perMillion(0.285),
        completionTextTokens: perMillion(14.25),
    },
} satisfies FallbackDefinition;
