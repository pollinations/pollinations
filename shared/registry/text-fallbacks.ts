import {
    defineCostVariants,
    longContextAtLeast,
    totalPromptTokens,
} from "./cost-variants";
import { openRouterGeminiBilling } from "./gemini-billing";
import type { FallbackMap } from "./merge-fallbacks";
import {
    PERPLEXITY_PRO_BILLING,
    PERPLEXITY_REASONING_BILLING,
    PERPLEXITY_SONAR_BILLING,
} from "./perplexity-billing";
import { perMillion } from "./price-helpers";
import { CHAT_PARAMETERS } from "./text-parameters";

/** Exact-checkpoint provider routes used when a text model's primary fails. */
export const TEXT_FALLBACKS = {
    "perplexity/sonar": {
        "perplexity/sonar:openrouter:perplexity": {
            supportedParameters: CHAT_PARAMETERS.openRouterSonar,
            provider: "openrouter",
            cost: {
                promptTextTokens: perMillion(1.0) * 1.055,
                completionTextTokens: perMillion(1.0) * 1.055,
            },
            billing: {
                adjustments: PERPLEXITY_SONAR_BILLING.adjustments?.map(
                    ({ resolveUnitCost, ...rule }) => ({
                        ...rule,
                        unitCost: rule.unitCost * 1.055,
                        ...(resolveUnitCost && {
                            resolveUnitCost: (
                                ...args: Parameters<typeof resolveUnitCost>
                            ) => resolveUnitCost(...args) * 1.055,
                        }),
                    }),
                ),
            },
        },
    },
    "perplexity/sonar-pro": {
        "perplexity/sonar-pro:openrouter:perplexity": {
            supportedParameters: CHAT_PARAMETERS.openRouterSonar,
            provider: "openrouter",
            cost: {
                promptTextTokens: perMillion(3.0) * 1.055,
                completionTextTokens: perMillion(15.0) * 1.055,
            },
            billing: {
                adjustments: PERPLEXITY_PRO_BILLING.adjustments?.map(
                    ({ resolveUnitCost, ...rule }) => ({
                        ...rule,
                        unitCost: rule.unitCost * 1.055,
                        ...(resolveUnitCost && {
                            resolveUnitCost: (
                                ...args: Parameters<typeof resolveUnitCost>
                            ) => resolveUnitCost(...args) * 1.055,
                        }),
                    }),
                ),
            },
        },
    },
    "perplexity/sonar-reasoning-pro": {
        "perplexity/sonar-reasoning-pro:openrouter:perplexity": {
            supportedParameters: CHAT_PARAMETERS.openRouterSonarReasoning,
            provider: "openrouter",
            cost: {
                promptTextTokens: perMillion(2.0) * 1.055,
                completionTextTokens: perMillion(8.0) * 1.055,
            },
            billing: {
                adjustments: PERPLEXITY_REASONING_BILLING.adjustments?.map(
                    ({ resolveUnitCost, ...rule }) => ({
                        ...rule,
                        unitCost: rule.unitCost * 1.055,
                        ...(resolveUnitCost && {
                            resolveUnitCost: (
                                ...args: Parameters<typeof resolveUnitCost>
                            ) => resolveUnitCost(...args) * 1.055,
                        }),
                    }),
                ),
            },
        },
    },
    "openai/gpt-6-astra": {
        "openai/gpt-6-astra:azure:datazone": {
            provider: "azure",
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
        },
    },
    "x-ai/grok-4.6": {
        "x-ai/grok-4.6:azure:sweden": {
            provider: "azure",
            addedDate: new Date("2026-09-06").getTime(),
        },
    },
    "deepseek/deepseek-v4-flash": {
        "deepseek/deepseek-v4-flash:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.08),
                promptCachedTokens: perMillion(0.016),
                completionTextTokens: perMillion(0.18),
            },
        },
    },
    "deepseek/deepseek-v4.1-flash": {
        "deepseek/deepseek-v4.1-flash:openrouter:deepinfra-fp8": {
            supportedParameters: CHAT_PARAMETERS.openRouterDeepseekV41Flash,
            provider: "openrouter",
            cost: {
                promptTextTokens: perMillion(0.2) * 1.055,
                promptCachedTokens: perMillion(0.006) * 1.055,
                completionTextTokens: perMillion(0.6) * 1.055,
            },
        },
    },
    "minimax/minimax-m2.7": {
        "minimax/minimax-m2.7:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.25),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(1),
            },
        },
    },
    "qwen/qwen3.8-2.4t-a95b": {
        "qwen/qwen3.8-2.4t-a95b:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(2),
                promptCachedTokens: perMillion(0.2),
                completionTextTokens: perMillion(6),
            },
        },
    },
    "tencent/hy3": {
        "tencent/hy3:openrouter:phala": {
            supportedParameters: CHAT_PARAMETERS.openRouterHy3Phala,
            provider: "openrouter",
            addedDate: new Date("2026-09-18").getTime(),
            // Phala route rates (2026-09-18, includes the mandatory 5.5%
            // OpenRouter credit fee); distinct provider from the Novita
            // primary, and the highest uptime of Hy3's six endpoints
            // (99.97%), with low latency (~1.6-2.5s) in local E2E testing.
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.04) * 1.055,
                completionTextTokens: perMillion(0.64) * 1.055,
            },
        },
    },
    "qwen/qwen3.8-27b": {
        "qwen/qwen3.8-27b:openrouter:akashml-fp8": {
            supportedParameters: CHAT_PARAMETERS.qwen38Akash,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen/qwen3.7-flash": {
        "qwen/qwen3.7-flash:alibaba": {
            supportedParameters: CHAT_PARAMETERS.alibabaQwen,
            provider: "alibaba",
            addedDate: new Date("2026-09-02").getTime(),
            // This bypasses OpenRouter but deliberately keeps Alibaba as the
            // inference provider, so it covers gateway/transport failures, not
            // an Alibaba-wide outage or rate limit.
            // The caller keeps the public OpenRouter quote. Direct Alibaba has
            // the same token rates except explicit cache reads cost 10% of
            // input instead of 20%; cache creation costs 125% on both routes.
            // Alibaba's tiers are >32K and >256K, unlike OpenRouter's inclusive
            // thresholds, so served cost is selected independently below.
            // There is no fallback loss; explicit hits and exact boundaries
            // can make the direct route cheaper than the unchanged quote.
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
            ),
            cost: {
                promptTextTokens: perMillion(0.03),
                promptCachedTokens: perMillion(0.006),
                promptCacheWriteTokens: perMillion(0.038),
                promptImageTokens: perMillion(0.03),
                promptVideoTokens: perMillion(0.03),
                completionTextTokens: perMillion(0.13),
            },
        },
    },
    "qwen/qwen3.8-flash": {
        "qwen/qwen3.8-flash:alibaba": {
            supportedParameters: CHAT_PARAMETERS.alibabaQwenReasoning,
            provider: "alibaba",
            addedDate: new Date("2026-09-05").getTime(),
            // This bypasses OpenRouter but deliberately keeps Alibaba as the
            // inference provider, so it covers gateway/transport failures, not
            // an Alibaba-wide outage or rate limit.
            // Direct Alibaba Singapore charges the same $0.15/M input, $0.016/M
            // implicit and explicit cache reads, $0.20/M cache creation, and
            // $0.47/M output before OpenRouter credit fees, with no context
            // tiers. Declare direct costs explicitly to omit that fee.
            cost: {
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.016),
                promptCacheWriteTokens: perMillion(0.2),
                promptImageTokens: perMillion(0.15),
                promptVideoTokens: perMillion(0.15),
                completionTextTokens: perMillion(0.47),
            },
        },
    },
    "moonshotai/kimi-k2.6": {
        "moonshotai/kimi-k2.6:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.75),
                promptCachedTokens: perMillion(0.15),
                promptImageTokens: perMillion(0.75),
                completionTextTokens: perMillion(3.5),
            },
        },
    },
    "meta/llama-3.3-70b-instruct": {
        "meta/llama-3.3-70b-instruct:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfra,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.32),
            },
        },
    },
    "mistralai/mistral-large-3": {
        "mistralai/mistral-large-3:openrouter:mistral-zdr": {
            supportedParameters: CHAT_PARAMETERS.openRouterMistralLarge,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.5) * 1.055,
                promptCachedTokens: perMillion(0.05) * 1.055,
                completionTextTokens: perMillion(1.5) * 1.055,
            },
        },
    },
    "mistralai/mistral-small-3.2": {
        "mistralai/mistral-small-3.2:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfra,
            provider: "deepinfra",
            addedDate: new Date("2026-09-02").getTime(),
            // This bypasses OpenRouter but deliberately keeps DeepInfra as the
            // inference provider, so it covers gateway/transport failures, not
            // a DeepInfra-wide outage or rate limit.
            // Direct DeepInfra is $0.075/M input and $0.20/M output,
            // without the OpenRouter credit fee in the public quote.
            cost: {
                promptTextTokens: perMillion(0.075),
                completionTextTokens: perMillion(0.2),
            },
        },
    },
    "google/gemma-4-26b-a4b-it": {
        "google/gemma-4-26b-a4b-it:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.07),
                promptImageTokens: perMillion(0.07),
                completionTextTokens: perMillion(0.34),
            },
        },
    },
    "google/gemma-4-31b-it": {
        "google/gemma-4-31b-it:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.13),
                promptImageTokens: perMillion(0.13),
                completionTextTokens: perMillion(0.38),
            },
        },
    },
    "anthropic/claude-opus-4.7": {
        "anthropic/claude-opus-4.7:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.openRouterOpus,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(5) * 1.055,
                promptCachedTokens: perMillion(0.5) * 1.055,
                promptCacheWriteTokens: perMillion(6.25) * 1.055,
                completionTextTokens: perMillion(25) * 1.055,
            },
        },
    },
    "meta/llama-4-scout": {
        "meta/llama-4-scout:openrouter:novita-bf16": {
            provider: "openrouter",
            addedDate: new Date("2026-09-15").getTime(),
            // OpenRouter Novita BF16, verified 2026-09-15. Callers retain the
            // DeepInfra quote; Pollinations absorbs the higher fallback cost.
            cost: {
                promptTextTokens: perMillion(0.18) * 1.055,
                promptImageTokens: perMillion(0.18) * 1.055,
                completionTextTokens: perMillion(0.59) * 1.055,
            },
        },
    },
    "x-ai/grok-4.20": {
        "x-ai/grok-4.20:openrouter:xai-zdr": {
            supportedParameters: CHAT_PARAMETERS.openRouterGrok420,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.25) * 1.055,
                promptCachedTokens: perMillion(0.2) * 1.055,
                promptImageTokens: perMillion(1.25) * 1.055,
                completionTextTokens: perMillion(2.5) * 1.055,
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(2.5) * 1.055,
                        promptCachedTokens: perMillion(0.4) * 1.055,
                        promptImageTokens: perMillion(2.5) * 1.055,
                        completionTextTokens: perMillion(5) * 1.055,
                    },
                },
                longContextAtLeast(200_000),
                {
                    long_context: {
                        label: "Long context (≥200K)",
                        description:
                            "OpenRouter xAI long-context pricing applies to the whole request.",
                    },
                },
                "<200K context",
            ),
        },
    },
    "x-ai/grok-4.3": {
        "x-ai/grok-4.3:openrouter:xai-zdr": {
            supportedParameters: CHAT_PARAMETERS.openRouterGrok43,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.25) * 1.055,
                promptCachedTokens: perMillion(0.2) * 1.055,
                promptImageTokens: perMillion(1.25) * 1.055,
                completionTextTokens: perMillion(2.5) * 1.055,
            },
        },
    },
    "anthropic/claude-haiku-4.5": {
        "anthropic/claude-haiku-4.5:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.openRouterHaiku,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1) * 1.055,
                promptCachedTokens: perMillion(0.1) * 1.055,
                promptCacheWriteTokens: perMillion(1.25) * 1.055,
                completionTextTokens: perMillion(5) * 1.055,
            },
        },
    },
    "anthropic/claude-fable-5": {
        "anthropic/claude-fable-5:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.openRouterOpus,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(10) * 1.055,
                promptCachedTokens: perMillion(1) * 1.055,
                promptCacheWriteTokens: perMillion(12.5) * 1.055,
                completionTextTokens: perMillion(50) * 1.055,
            },
        },
    },
    "meta/muse-glimmer-30b": {
        "meta/muse-glimmer-30b:openrouter:deepinfra-bf16": {
            supportedParameters: CHAT_PARAMETERS.openRouterMuseGlimmer,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.3) * 1.055,
                promptCachedTokens: perMillion(0.04) * 1.055,
                promptImageTokens: perMillion(0.3) * 1.055,
                completionTextTokens: perMillion(1.2) * 1.055,
            },
        },
    },
    "nvidia/nemotron-3.5-lightning": {
        "nvidia/nemotron-3.5-lightning:openrouter:coreweave-bf16": {
            supportedParameters: CHAT_PARAMETERS.openRouterNemotron,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1) * 1.055,
                promptCachedTokens: perMillion(0.05) * 1.055,
                completionTextTokens: perMillion(0.25) * 1.055,
            },
        },
    },
    "mistralai/mistral-small-4": {
        "mistralai/mistral-small-4:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.015),
                promptImageTokens: perMillion(0.15),
                completionTextTokens: perMillion(0.6),
            },
        },
    },
    "google/gemini-3.7-flash": {
        "google/gemini-3.7-flash:openrouter:ai-studio-priority": {
            supportedParameters: CHAT_PARAMETERS.gemini35AiStudio,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.35) * 1.055,
                promptCachedTokens: perMillion(0.135) * 1.055,
                promptCacheWriteTokens: perMillion(1.35) * 1.055,
                promptAudioTokens: perMillion(1.35) * 1.055,
                promptImageTokens: perMillion(1.35) * 1.055,
                promptVideoTokens: perMillion(1.35) * 1.055,
                completionTextTokens: perMillion(6.75) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 0.9 * 1.055,
            }),
        },
    },
    "google/gemini-2.5-flash-lite": {
        "google/gemini-2.5-flash-lite:openrouter:vertex-global": {
            provider: "openrouter",
            addedDate: new Date("2026-09-16").getTime(),
        },
        "google/gemini-2.5-flash-lite:openrouter:ai-studio": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3.5-flash-lite": {
        "google/gemini-3.5-flash-lite:openrouter:ai-studio-flex": {
            supportedParameters: CHAT_PARAMETERS.gemini35AiStudio,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.015) * 1.055,
                promptCacheWriteTokens: perMillion(0.15) * 1.055,
                promptAudioTokens: perMillion(0.15) * 1.055,
                promptImageTokens: perMillion(0.15) * 1.055,
                promptVideoTokens: perMillion(0.15) * 1.055,
                completionTextTokens: perMillion(1.25) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 0.5 * 1.055,
            }),
        },
    },
    "google/gemini-3.1-pro-preview": {
        "google/gemini-3.1-pro-preview:openrouter:ai-studio": {
            supportedParameters: CHAT_PARAMETERS.gemini3AiStudio,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen/qwen3-vl-235b-a22b-thinking": {
        "qwen/qwen3-vl-235b-a22b-thinking:openrouter:novita-bf16": {
            supportedParameters: CHAT_PARAMETERS.openRouterQwenVl,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.98) * 1.055,
                promptImageTokens: perMillion(0.98) * 1.055,
                completionTextTokens: perMillion(3.95) * 1.055,
                completionReasoningTokens: perMillion(3.95) * 1.055,
            },
        },
    },
    "z-ai/glm-5.3": {
        "z-ai/glm-5.3:openrouter:friendli": {
            supportedParameters: CHAT_PARAMETERS.openRouterGlm53,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.26) * 1.055,
                promptCachedTokens: perMillion(0.234) * 1.055,
                completionTextTokens: perMillion(3.96) * 1.055,
            },
        },
    },
    "moonshotai/kimi-k2.7-code": {
        "moonshotai/kimi-k2.7-code:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.68),
                promptCachedTokens: perMillion(0.136),
                promptCacheWriteTokens: perMillion(0.85),
                promptImageTokens: perMillion(0.68),
                completionTextTokens: perMillion(3.4),
            },
        },
    },
    "qwen/qwen3-coder-next": {
        "qwen/qwen3-coder-next:openrouter:streamlake": {
            supportedParameters: CHAT_PARAMETERS.openRouterQwenCoderNext,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.18) * 1.055,
                promptCachedTokens: perMillion(0.036) * 1.055,
                completionTextTokens: perMillion(0.9) * 1.055,
            },
        },
    },
} as const satisfies FallbackMap;
