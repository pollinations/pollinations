import { defineCostVariants, totalPromptTokens } from "../../cost-variants";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "qwen/qwen3.7-flash";

export default {
    supportedParameters: CHAT_PARAMETERS.alibabaQwen,
    aliases: ["qwen3.7-flash"],
    provider: "alibaba",
    publisher: "Qwen",
    category: "text",
    addedDate: new Date("2026-07-30").getTime(),
    paidOnly: true,
    priceMultiplier: 1,
    ...defineCostVariants(
        {
            context_32k: {
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.02),
                promptCacheWriteTokens: perMillion(0.125),
                promptImageTokens: perMillion(0.1),
                promptVideoTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.4),
            },
            context_256k: {
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.04),
                promptCacheWriteTokens: perMillion(0.25),
                promptImageTokens: perMillion(0.2),
                promptVideoTokens: perMillion(0.2),
                completionTextTokens: perMillion(0.8),
            },
            explicit_cache: {
                promptCachedTokens: perMillion(0.003),
            },
            context_32k_explicit_cache: {
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.01),
                promptCacheWriteTokens: perMillion(0.125),
                promptImageTokens: perMillion(0.1),
                promptVideoTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.4),
            },
            context_256k_explicit_cache: {
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.02),
                promptCacheWriteTokens: perMillion(0.25),
                promptImageTokens: perMillion(0.2),
                promptVideoTokens: perMillion(0.2),
                completionTextTokens: perMillion(0.8),
            },
        },
        ({ usage, input }) => {
            const promptTokens = totalPromptTokens(usage);
            const tier =
                promptTokens > 256_000
                    ? "context_256k"
                    : promptTokens > 32_000
                      ? "context_32k"
                      : undefined;
            if (!input?.hasExplicitCacheHit) return tier;
            if (tier === "context_256k") {
                return "context_256k_explicit_cache";
            }
            if (tier === "context_32k") {
                return "context_32k_explicit_cache";
            }
            return "explicit_cache";
        },
        {
            context_32k: {
                label: ">32K context",
                description:
                    "Direct Alibaba rates above 32,000 prompt tokens; the higher rates apply to the whole request.",
            },
            context_256k: {
                label: ">256K context",
                description:
                    "Direct Alibaba rates above 256,000 prompt tokens; the highest rates apply to the whole request.",
            },
            explicit_cache: {
                label: "Explicit cache, ≤32K context",
                description:
                    "Direct Alibaba explicit-cache reads cost 10% of input; creation costs 125%.",
            },
            context_32k_explicit_cache: {
                label: "Explicit cache, >32K context",
                description:
                    "Direct Alibaba >32K rates with explicit-cache reads at 10% of input.",
            },
            context_256k_explicit_cache: {
                label: "Explicit cache, >256K context",
                description:
                    "Direct Alibaba >256K rates with explicit-cache reads at 10% of input.",
            },
        },
        "≤32K context, implicit/no cache",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "≤32K",
                    "context_32k": ">32K–256K",
                    "context_256k": ">256K",
                    "explicit_cache": "≤32K",
                    "context_32k_explicit_cache": ">32K–256K",
                    "context_256k_explicit_cache": ">256K",
                },
            },
            {
                "key": "cache",
                "label": "Cache",
                "values": {
                    "": "Default",
                    "context_32k": "Default",
                    "context_256k": "Default",
                    "explicit_cache": "Explicit",
                    "context_32k_explicit_cache": "Explicit",
                    "context_256k_explicit_cache": "Explicit",
                },
            },
        ],
    ),
    cost: {
        promptTextTokens: perMillion(0.03),
        promptCachedTokens: perMillion(0.006),
        promptCacheWriteTokens: perMillion(0.038),
        promptImageTokens: perMillion(0.03),
        promptVideoTokens: perMillion(0.03),
        completionTextTokens: perMillion(0.13),
    },
    title: "Qwen3.7 Flash",
    description:
        "Ultra-low-cost multimodal reasoning for agents and visual tasks",
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 10,
    maxReferenceVideos: 10,
    tools: true,
    reasoning: true,
    contextLength: 1000000,
    isSpecialized: false,
} satisfies ModelDefinition;
