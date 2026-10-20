import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "minimax/minimax-m3:deepinfra";
export const parent = "minimax/minimax-m3";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    // https://deepinfra.com/MiniMaxAI/MiniMax-M3 (2026-10-07).
    cost: {
        promptTextTokens: perMillion(0.28),
        promptCachedTokens: perMillion(0.056),
        completionTextTokens: perMillion(1.1),
    },
} satisfies FallbackDefinition;
