import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-large-3:mistral";
export const parent = "mistralai/mistral-large-3";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.mistralLarge,
    provider: "mistral",
    addedDate: new Date("2026-09-22").getTime(),
    cost: {
        promptTextTokens: perMillion(0.5),
        promptCachedTokens: perMillion(0.05),
        completionTextTokens: perMillion(1.5),
    },
} satisfies FallbackDefinition;
