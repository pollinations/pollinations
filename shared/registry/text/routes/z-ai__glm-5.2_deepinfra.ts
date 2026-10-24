import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.2:deepinfra";
export const parent = "z-ai/glm-5.2";
export const order = 0;

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-23").getTime(),
    cost: {
        // DeepInfra FP4 rates (2026-09-23): list $0.75/$2.40 with an
        // open-ended 25% discount.
        promptTextTokens: perMillion(0.5625),
        promptCachedTokens: perMillion(0.105),
        completionTextTokens: perMillion(1.8),
    },
} satisfies FallbackDefinition;
