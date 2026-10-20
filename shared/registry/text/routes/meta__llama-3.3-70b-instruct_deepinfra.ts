import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "meta/llama-3.3-70b-instruct:deepinfra";
export const parent = "meta/llama-3.3-70b-instruct";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfra,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(0.1),
        completionTextTokens: perMillion(0.32),
    },
} satisfies FallbackDefinition;
