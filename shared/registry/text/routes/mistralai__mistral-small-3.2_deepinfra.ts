import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "mistralai/mistral-small-3.2:deepinfra";
export const parent = "mistralai/mistral-small-3.2";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfra,
    provider: "deepinfra",
    addedDate: new Date("2026-09-02").getTime(),
    // This bypasses OpenRouter but deliberately keeps DeepInfra as the
    // inference provider, so it covers gateway/transport failures, not
    // a DeepInfra-wide outage or rate limit.
    // Direct DeepInfra is $0.075/M input and $0.20/M output,
    // without the OpenRouter credit fee in the public quote.
    cost: {
        promptTextTokens: perMillion(0.075),
        completionTextTokens: perMillion(0.2),
    },
} satisfies FallbackDefinition;
