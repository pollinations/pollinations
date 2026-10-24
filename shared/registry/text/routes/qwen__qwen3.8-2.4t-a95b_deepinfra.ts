import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-2.4t-a95b:deepinfra";
export const parent = "qwen/qwen3.8-2.4t-a95b";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-01").getTime(),
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.2),
        completionTextTokens: perMillion(6),
    },
} satisfies FallbackDefinition;
