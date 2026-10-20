import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "nvidia/nemotron-3-ultra:deepinfra";
export const parent = "nvidia/nemotron-3-ultra";

export default {
    supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
    provider: "deepinfra",
    addedDate: new Date("2026-09-30").getTime(),
    cost: {
        // DeepInfra standard-tier rates (2026-09-30). Flex is
        // deliberately excluded because requests may wait up to ten
        // minutes.
        promptTextTokens: perMillion(0.5),
        promptCachedTokens: perMillion(0.1),
        completionTextTokens: perMillion(2.2),
    },
} satisfies FallbackDefinition;
