import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemma-4-31b-it:deepinfra";
export const parent = "google/gemma-4-31b-it";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.2),
        promptImageTokens: perMillion(0.2),
        completionTextTokens: perMillion(0.4),
    },
} satisfies FallbackDefinition;
