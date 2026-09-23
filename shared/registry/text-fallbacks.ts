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
    // OpenRouter Alibaba routes cover gateway failures, not Alibaba-wide outages.
    // Max currently requires reasoning and rejects forced tool choice.
    "qwen/qwen3.8-max": {
        "qwen/qwen3.8-max:openrouter:alibaba": {
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
        },
    },
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
                // DeepInfra standard-tier rates (2026-09-21).
                promptTextTokens: perMillion(0.06),
                promptCachedTokens: perMillion(0.015),
                completionTextTokens: perMillion(0.18),
            },
        },
    },
    "deepseek/deepseek-v4.1-flash": {
        "deepseek/deepseek-v4.1-flash:openrouter:deepinfra-fp8": {
            supportedParameters: CHAT_PARAMETERS.openRouterDeepseekV41Flash,
            provider: "openrouter",
            cost: {
                // OpenRouter DeepInfra FP8 rates (2026-09-21), including the
                // account's 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.14) * 1.055,
                promptCachedTokens: perMillion(0.0042) * 1.055,
                completionTextTokens: perMillion(0.42) * 1.055,
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
            cost: {
                // OpenRouter AkashML FP8 rates (2026-09-21), including the
                // account's 5.5% credit-purchase fee. OpenRouter publishes one
                // prompt rate and no separate image/video rates.
                promptTextTokens: perMillion(0.25) * 1.055,
                promptCachedTokens: perMillion(0.05) * 1.055,
                promptImageTokens: perMillion(0.25) * 1.055,
                promptVideoTokens: perMillion(0.25) * 1.055,
                completionTextTokens: perMillion(2.2) * 1.055,
            },
        },
    },
    "qwen/qwen3.7-flash": {
        "qwen/qwen3.7-flash:openrouter:alibaba": {
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
        },
    },
    "qwen/qwen3.8-flash": {
        "qwen/qwen3.8-flash:openrouter:alibaba": {
            provider: "openrouter",
            supportedParameters: CHAT_PARAMETERS.qwen38Max,
            // OpenRouter Alibaba route rates, equal to the Alibaba Singapore list
            // price with a single 0-1M context tier (2026-09-05). OpenRouter
            // publishes one prompt rate and no separate image/video rates.
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.016) * 1.055,
                promptCacheWriteTokens: perMillion(0.2) * 1.055,
                promptImageTokens: perMillion(0.15) * 1.055,
                promptVideoTokens: perMillion(0.15) * 1.055,
                completionTextTokens: perMillion(0.47) * 1.055,
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
        "mistralai/mistral-large-3:mistral": {
            supportedParameters: CHAT_PARAMETERS.mistralLarge,
            provider: "mistral",
            addedDate: new Date("2026-09-22").getTime(),
            cost: {
                promptTextTokens: perMillion(0.5),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(1.5),
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
        "google/gemma-4-26b-a4b-it:openrouter:novita-bf16": {
            supportedParameters: CHAT_PARAMETERS.openRouterGemma,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                // OpenRouter Novita BF16 preserves remote image URLs.
                promptTextTokens: perMillion(0.13) * 1.055,
                promptImageTokens: perMillion(0.13) * 1.055,
                completionTextTokens: perMillion(0.4) * 1.055,
            },
        },
    },
    "google/gemma-4-31b-it": {
        "google/gemma-4-31b-it:openrouter:novita-bf16": {
            supportedParameters: CHAT_PARAMETERS.openRouterGemma,
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                // OpenRouter Novita BF16 endpoint.
                promptTextTokens: perMillion(0.14) * 1.055,
                promptImageTokens: perMillion(0.14) * 1.055,
                completionTextTokens: perMillion(0.4) * 1.055,
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
    "anthropic/claude-opus-5.5": {
        "anthropic/claude-opus-5.5:openrouter:anthropic": {
            supportedParameters: CHAT_PARAMETERS.openRouterOpus,
            provider: "openrouter",
            addedDate: new Date("2026-09-22").getTime(),
            // Temporary OpenRouter fallback until a direct Azure route and
            // its price are verified against this route's effective cost.
            cost: {
                promptTextTokens: perMillion(4) * 1.055,
                promptCachedTokens: perMillion(0.2) * 1.055,
                promptCacheWriteTokens: perMillion(5) * 1.055,
                completionTextTokens: perMillion(20) * 1.055,
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
                // OpenRouter CoreWeave BF16 rates (2026-09-21), including the
                // account's 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.07) * 1.055,
                promptCachedTokens: perMillion(0.04) * 1.055,
                completionTextTokens: perMillion(0.2) * 1.055,
            },
        },
    },
    "mistralai/mistral-small-4": {
        "mistralai/mistral-small-4:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.015) * 1.055,
                promptImageTokens: perMillion(0.15) * 1.055,
                completionTextTokens: perMillion(0.6) * 1.055,
            },
        },
    },
    "google/gemini-3-flash-preview": {
        "google/gemini-3-flash-preview:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.gemini3,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.5) * 1.055,
                promptCachedTokens: perMillion(0.05) * 1.055,
                promptCacheWriteTokens: perMillion(0.5) * 1.055,
                promptAudioTokens: perMillion(1.0) * 1.055,
                promptImageTokens: perMillion(0.5) * 1.055,
                promptVideoTokens: perMillion(0.5) * 1.055,
                completionTextTokens: perMillion(3.0) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 1.0 * 1.055,
            }),
        },
    },
    "google/gemini-3.7-flash": {
        "google/gemini-3.7-flash:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.gemini35,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.75) * 1.055,
                promptCachedTokens: perMillion(0.075) * 1.055,
                promptCacheWriteTokens: perMillion(0.75) * 1.055,
                promptAudioTokens: perMillion(0.75) * 1.055,
                promptImageTokens: perMillion(0.75) * 1.055,
                promptVideoTokens: perMillion(0.75) * 1.055,
                completionTextTokens: perMillion(3.75) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 0.5 * 1.055,
            }),
        },
    },
    "google/gemini-3.8-flash": {
        "google/gemini-3.8-flash:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.gemini35,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.75) * 1.055,
                promptCachedTokens: perMillion(0.075) * 1.055,
                promptCacheWriteTokens: perMillion(0.75) * 1.055,
                promptAudioTokens: perMillion(0.75) * 1.055,
                promptImageTokens: perMillion(0.75) * 1.055,
                promptVideoTokens: perMillion(0.75) * 1.055,
                completionTextTokens: perMillion(3.75) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 0.5 * 1.055,
            }),
        },
    },
    "google/gemini-2.5-flash-lite": {
        "google/gemini-2.5-flash-lite:openrouter:vertex-eu": {
            supportedParameters: CHAT_PARAMETERS.gemini25,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1) * 1.055,
                promptCachedTokens: perMillion(0.01) * 1.055,
                promptCacheWriteTokens: perMillion(0.1) * 1.055,
                promptAudioTokens: perMillion(0.3) * 1.055,
                promptImageTokens: perMillion(0.1) * 1.055,
                promptVideoTokens: perMillion(0.1) * 1.055,
                completionTextTokens: perMillion(0.4) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 1.0 * 1.055,
            }),
        },
    },
    "google/gemini-3.5-flash-lite": {
        "google/gemini-3.5-flash-lite:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.gemini35,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(0.3) * 1.055,
                promptCachedTokens: perMillion(0.03) * 1.055,
                promptCacheWriteTokens: perMillion(0.3) * 1.055,
                promptAudioTokens: perMillion(0.3) * 1.055,
                promptImageTokens: perMillion(0.3) * 1.055,
                promptVideoTokens: perMillion(0.3) * 1.055,
                completionTextTokens: perMillion(2.5) * 1.055,
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 1.0 * 1.055,
            }),
        },
    },
    "google/gemini-3.1-pro-preview": {
        "google/gemini-3.1-pro-preview:openrouter:vertex-global": {
            supportedParameters: CHAT_PARAMETERS.gemini3,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-21").getTime(),
            cost: {
                promptTextTokens: perMillion(2.0) * 1.055,
                promptCachedTokens: perMillion(0.2) * 1.055,
                promptCacheWriteTokens: perMillion(2.0) * 1.055,
                promptAudioTokens: perMillion(2.0) * 1.055,
                promptImageTokens: perMillion(2.0) * 1.055,
                promptVideoTokens: perMillion(2.0) * 1.055,
                completionTextTokens: perMillion(12.0) * 1.055,
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(4.0) * 1.055,
                        promptCachedTokens: perMillion(0.4) * 1.055,
                        promptCacheWriteTokens: perMillion(4.0) * 1.055,
                        promptAudioTokens: perMillion(4.0) * 1.055,
                        promptVideoTokens: perMillion(4.0) * 1.055,
                        completionTextTokens: perMillion(18.0) * 1.055,
                    },
                },
                longContextAtLeast(200_000),
                {
                    long_context: {
                        label: "Long context (200K+)",
                        description:
                            "At least 200,000 prompt tokens; text, cached, cache-write, audio, video, and output rates increase while image input stays at its separately advertised base price.",
                    },
                },
                "<200K context",
            ),
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 4.5 * 1.055,
            }),
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
