import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3:deepinfra";
export const parent = "z-ai/glm-5.3";

export default {
    supportedParameters: [
        ...CHAT_PARAMETERS.deepinfraReasoning.filter(
            (parameter) =>
                parameter !== "logprobs" && parameter !== "top_logprobs",
        ),
        "parallel_tool_calls",
    ],
    provider: "deepinfra",
    cost: {
        // Current 37.5% promotion; no announced end date or gateway fee.
        promptTextTokens: perMillion(0.9) * 0.625,
        promptCachedTokens: perMillion(0.2) * 0.625,
        completionTextTokens: perMillion(4) * 0.625,
    },
} satisfies FallbackDefinition;
