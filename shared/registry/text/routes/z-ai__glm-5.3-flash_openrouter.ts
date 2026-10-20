import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "z-ai/glm-5.3-flash:openrouter";
export const parent = "z-ai/glm-5.3-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.openRouterGlm53,
    provider: "openrouter",
    contextLength: 1048575,
    cost: {
        // Same-priced OpenRouter routes, including its 5.5% credit fee.
        promptTextTokens: perMillion(0.15) * 1.055,
        promptCachedTokens: perMillion(0.03) * 1.055,
        promptImageTokens: perMillion(0.15) * 1.055,
        completionTextTokens: perMillion(0.5) * 1.055,
    },
} satisfies FallbackDefinition;
