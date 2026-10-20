import { defineCostVariants } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.8-max";

export default {
    supportedParameters: CHAT_PARAMETERS.alibabaQwenReasoning,
    aliases: ["qwen3.8-max"],
    provider: "alibaba",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-08-04").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    ...defineCostVariants(
        { explicit_cache: { promptCachedTokens: perMillion(0.17) } },
        ({ input }) =>
            input?.hasExplicitCacheHit ? "explicit_cache" : undefined,
        {
            explicit_cache: {
                label: "Explicit cache",
                description:
                    "Direct Alibaba explicit-cache reads cost $0.17 per million tokens.",
            },
        },
        "Implicit/no cache",
        [
            {
                key: "cache",
                label: "Cache",
                values: {
                    "": "Implicit/no cache",
                    explicit_cache: "Explicit",
                },
            },
        ],
    ),
    cost: {
        promptTextTokens: perMillion(2),
        promptCachedTokens: perMillion(0.25),
        promptCacheWriteTokens: perMillion(2.5),
        promptImageTokens: perMillion(2),
        promptVideoTokens: perMillion(2),
        completionTextTokens: perMillion(6),
    },
    title: "Qwen3.8 Max",
    description:
        "Million-token multimodal reasoning for coding and autonomous agents",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxReferenceVideos: 10,
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
