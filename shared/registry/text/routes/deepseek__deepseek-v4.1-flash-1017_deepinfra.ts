import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "deepseek/deepseek-v4.1-flash-1017:deepinfra";
export const parent = "deepseek/deepseek-v4.1-flash-1017";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-10-18").getTime(),
    cost: {
        // DeepInfra list rates (2026-10-18); its 51% promotion is not
        // passed on.
        promptTextTokens: perMillion(0.2),
        promptCachedTokens: perMillion(0.006),
        completionTextTokens: perMillion(0.6),
    },
} satisfies FallbackDefinition;
