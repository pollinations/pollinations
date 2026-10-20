import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-max:openrouter:alibaba";
export const parent = "qwen/qwen3.8-max";
export const order = 0;

export default {
    provider: "openrouter",
    supportedParameters: CHAT_PARAMETERS.qwen38Max,
    cost: {
        promptTextTokens: perMillion(2) * 1.055,
        promptCachedTokens: perMillion(0.25) * 1.055,
        promptCacheWriteTokens: perMillion(2.5) * 1.055,
        promptImageTokens: perMillion(2) * 1.055,
        promptVideoTokens: perMillion(2) * 1.055,
        completionTextTokens: perMillion(6) * 1.055,
    },
    // Alibaba's direct explicit-cache rate does not apply to OpenRouter.
    costVariants: undefined,
    selectCostVariant: undefined,
    costVariantMetadata: undefined,
    defaultCostVariantLabel: undefined,
    pricingDimensions: undefined,
} satisfies FallbackDefinition;
