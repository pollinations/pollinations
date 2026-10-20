import type { FallbackDefinition } from "../../merge-fallbacks";
import { perMillion } from "../../price-helpers";

export const id = "openai/gpt-6-astra:azure:datazone";
export const parent = "openai/gpt-6-astra";

export default {
    provider: "azure",
    // Provider retires this route on 2028-01-11.
    // Same checkpoint, separate US Data Zone quota pool. The caller
    // keeps the Global quote; Pollinations absorbs the 10% premium.
    cost: {
        promptTextTokens: perMillion(11),
        promptCachedTokens: perMillion(1.1),
        promptCacheWriteTokens: perMillion(13.75),
        completionTextTokens: perMillion(55),
    },
    costVariants: {
        long_context: {
            promptTextTokens: perMillion(22),
            promptCachedTokens: perMillion(2.2),
            promptCacheWriteTokens: perMillion(27.5),
            completionTextTokens: perMillion(82.5),
        },
    },
} satisfies FallbackDefinition;
