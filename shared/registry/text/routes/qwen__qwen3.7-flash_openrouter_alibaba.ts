import { defineCostVariants, totalPromptTokens } from "../../cost-variants";
import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.7-flash:openrouter:alibaba";
export const parent = "qwen/qwen3.7-flash";

export default {
    provider: "openrouter",
    supportedParameters: CHAT_PARAMETERS.openRouterQwen37Flash,
    // OpenRouter's min_prompt_tokens overrides apply from 32K and 256K
    // total prompt tokens.
    cost: {
        promptTextTokens: perMillion(0.03) * 1.055,
        promptCachedTokens: perMillion(0.006) * 1.055,
        promptCacheWriteTokens: perMillion(0.038) * 1.055,
        promptImageTokens: perMillion(0.03) * 1.055,
        promptVideoTokens: perMillion(0.03) * 1.055,
        completionTextTokens: perMillion(0.13) * 1.055,
    },
    ...defineCostVariants(
        {
            context_32k: {
                promptTextTokens: perMillion(0.1) * 1.055,
                promptCachedTokens: perMillion(0.02) * 1.055,
                promptCacheWriteTokens: perMillion(0.125) * 1.055,
                promptImageTokens: perMillion(0.1) * 1.055,
                promptVideoTokens: perMillion(0.1) * 1.055,
                completionTextTokens: perMillion(0.4) * 1.055,
            },
            context_256k: {
                promptTextTokens: perMillion(0.2) * 1.055,
                promptCachedTokens: perMillion(0.04) * 1.055,
                promptCacheWriteTokens: perMillion(0.25) * 1.055,
                promptImageTokens: perMillion(0.2) * 1.055,
                promptVideoTokens: perMillion(0.2) * 1.055,
                completionTextTokens: perMillion(0.8) * 1.055,
            },
        },
        ({ usage }) => {
            const promptTokens = totalPromptTokens(usage);
            if (promptTokens >= 256_000) return "context_256k";
            if (promptTokens >= 32_000) return "context_32k";
            return undefined;
        },
        {
            context_32k: {
                label: "32K+ context",
                description:
                    "At least 32,000 prompt tokens; the higher rates apply to the whole request.",
            },
            context_256k: {
                label: "256K+ context",
                description:
                    "At least 256,000 prompt tokens; the highest rates apply to the whole request.",
            },
        },
        "<32K context",
    ),
} satisfies FallbackDefinition;
