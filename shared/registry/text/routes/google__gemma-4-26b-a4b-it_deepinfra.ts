import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemma-4-26b-a4b-it:deepinfra";
export const parent = "google/gemma-4-26b-a4b-it";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.07),
        promptImageTokens: perMillion(0.07),
        completionTextTokens: perMillion(0.34),
    },
} satisfies FallbackDefinition;
