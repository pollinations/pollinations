import {
    defineCostVariants,
    longContextAbove,
    longContextAtLeast,
    totalPromptTokens,
} from "./cost-variants";
import {
    openRouterGeminiBilling,
    VERCEL_EXA_SEARCH_BILLING,
} from "./gemini-billing";
import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";
import { CHAT_PARAMETERS } from "./text-parameters";

/** Exact-checkpoint provider routes used when a text model's primary fails. */
export const TEXT_FALLBACKS = {
    "qwen/qwen3-coder-30b-a3b-instruct": {
        "qwen/qwen3-coder-30b-a3b-instruct:aws": {
            provider: "aws",
            cost: {
                promptTextTokens: perMillion(0.15),
                completionTextTokens: perMillion(0.6),
            },
        },
    },
    "perplexity/pplx-decider-v1.2": {
        // Same Perplexity backend; covers gateway failures, not Perplexity outages.
        "perplexity/pplx-decider-v1.2:openrouter": {
            provider: "openrouter",
            // OpenRouter list price plus its 5.5% credit fee.
            cost: {
                promptTextTokens: perMillion(0.02) * 1.055,
                completionTextTokens: perMillion(0),
            },
        },
    },
    "liquid/d1": {
        // Same Liquid backend; covers gateway failures, not Liquid outages.
        "liquid/d1:openrouter": {
            provider: "openrouter",
            priceMultiplier: 1,
            cost: {
                promptTextTokens: perMillion(0.02) * 1.055,
                promptCachedTokens: perMillion(0.02) * 1.055,
                completionTextTokens: perMillion(0),
            },
        },
    },
    "microsoft/microsoft-decision-1": {
        // Same Azure backend; covers gateway failures, not Microsoft outages.
        "microsoft/microsoft-decision-1:vercel": {
            provider: "vercel",
            priceMultiplier: 1,
            // Vercel AI Gateway list price, the cheapest route.
            cost: {
                promptTextTokens: perMillion(0.042),
                completionTextTokens: perMillion(0),
            },
        },
        "microsoft/microsoft-decision-1:openrouter": {
            provider: "openrouter",
            priceMultiplier: 1,
            // OpenRouter list price plus its 5.5% credit fee.
            cost: {
                promptTextTokens: perMillion(0.042) * 1.055,
                completionTextTokens: perMillion(0),
            },
        },
    },
    "anthropic/claude-opus-5": {
        // Anthropic's global rates equal the Bedrock global sheet (2026-10-24).
        "anthropic/claude-opus-5:anthropic": {
            provider: "anthropic",
            addedDate: new Date("2026-10-24").getTime(),
        },
    },
    "openai/gpt-6-luna-decisions": {
        // Same OpenAI backend; covers direct-route failures, not OpenAI outages.
        "openai/gpt-6-luna-decisions:openrouter": {
            provider: "openrouter",
            cost: {
                promptTextTokens: perMillion(0.1) * 1.055,
                completionTextTokens: perMillion(0),
                promptCachedTokens: perMillion(0),
                promptCacheWriteTokens: perMillion(0),
            },
            // OpenRouter's flat rate must not inherit OpenAI's context tier.
            costVariants: undefined,
            selectCostVariant: undefined,
            costVariantMetadata: undefined,
            defaultCostVariantLabel: undefined,
            pricingDimensions: undefined,
        },
    },
    "stepfun/step-5-preview": {
        // Same StepFun model through Vercel's AI Gateway pinned to DeepInfra
        // (2026-10-24), without OpenRouter's credit fee.
        "stepfun/step-5-preview:vercel": {
            provider: "vercel",
            cost: {
                promptTextTokens: perMillion(1),
                promptCachedTokens: perMillion(0.1),
                completionTextTokens: perMillion(2.7),
            },
        },
    },
    "stepfun/step-3.7-flash": {
        // StepFun's own endpoint through Vercel's AI Gateway at the posted base rates.
        "stepfun/step-3.7-flash:vercel": {
            provider: "vercel",
            cost: {
                promptTextTokens: perMillion(0.2),
                promptCachedTokens: perMillion(0.04),
                completionTextTokens: perMillion(1.15),
            },
        },
    },
    "openai/gpt-4o-mini": {
        "openai/gpt-4o-mini:openrouter:openai": {
            provider: "openrouter",
            priceMultiplier: 1,
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.075) * 1.055,
                completionTextTokens: perMillion(0.6) * 1.055,
            },
        },
    },
    "inclusionai/ling-3.1-flash": {
        "inclusionai/ling-3.1-flash:vercel:novita": {
            provider: "vercel",
            // Same Novita checkpoint through a separate gateway, which adds
            // no fee. Vercel still listed it free on 2026-10-13.
            cost: {
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.06),
                completionTextTokens: perMillion(0.9),
            },
        },
    },
    // OpenRouter Alibaba routes cover gateway failures, not Alibaba-wide outages.
    // Max currently requires reasoning and rejects forced tool choice.
    "typesafe/jev-1.13": {
        // Same TypeSafe backend; covers gateway failures, not TypeSafe outages.
        "typesafe/jev-1.13:openrouter:typesafe": {
            provider: "openrouter",
            priceMultiplier: 1,
            cost: {
                promptTextTokens: perMillion(0.042) * 1.055,
                completionTextTokens: perMillion(0),
            },
        },
    },
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
            // Alibaba's direct explicit-cache rate does not apply to OpenRouter.
            costVariants: undefined,
            selectCostVariant: undefined,
            costVariantMetadata: undefined,
            defaultCostVariantLabel: undefined,
            pricingDimensions: undefined,
        },
    },
    "openai/gpt-5.3-codex": {
        "openai/gpt-5.3-codex:azure:sweden": {
            provider: "azure",
            // Provider retires this route on 2027-08-24.
        },
    },
    "openai/gpt-6-astra": {
        "openai/gpt-6-astra:azure:datazone": {
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
        },
    },
    "openai/gpt-6-sol": {
        "openai/gpt-6-sol:openai": { provider: "openai" },
    },
    "openai/gpt-6.1-sol": {
        "openai/gpt-6.1-sol:openai": { provider: "openai" },
    },
    "openai/gpt-6-luna": {
        "openai/gpt-6-luna:openai": { provider: "openai" },
    },
    "x-ai/grok-4.6": {
        "x-ai/grok-4.6:xai": {
            provider: "xai",
            priceMultiplier: 1,
            addedDate: new Date("2026-09-24").getTime(),
            // xAI /v1/language-models/grok-4.6 rates (2026-09-24). Image tokens
            // bill at the text input rate; reasoning bills as output.
            cost: {
                promptTextTokens: perMillion(2),
                promptCachedTokens: perMillion(0.5),
                promptImageTokens: perMillion(2),
                completionTextTokens: perMillion(6),
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(4),
                        promptCachedTokens: perMillion(1),
                        promptImageTokens: perMillion(4),
                        completionTextTokens: perMillion(12),
                    },
                },
                longContextAtLeast(200_000),
                {
                    long_context: {
                        label: "Long context (≥200K)",
                        description:
                            "xAI doubles text, cached, image, and output rates for the whole request.",
                    },
                },
                "<200K context",
            ),
        },
    },
    "x-ai/grok-4.7": {
        "x-ai/grok-4.7:openrouter": {
            provider: "openrouter",
            addedDate: new Date("2026-10-12").getTime(),
            // OpenRouter base xAI rates (2026-10-12), including the account's
            // 5.5% credit-purchase fee. Images are tokenized into text tokens.
            cost: {
                promptTextTokens: perMillion(2) * 1.055,
                promptCachedTokens: perMillion(0.5) * 1.055,
                completionTextTokens: perMillion(6) * 1.055,
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(4) * 1.055,
                        promptCachedTokens: perMillion(1) * 1.055,
                        completionTextTokens: perMillion(12) * 1.055,
                    },
                },
                longContextAtLeast(200_000),
                {
                    long_context: {
                        label: "Long context (≥200K)",
                        description:
                            "xAI doubles text, cached, and output rates for the whole request.",
                    },
                },
                "<200K context",
            ),
        },
    },
    "xiaomi/mimo-v2.6-flash": {
        "xiaomi/mimo-v2.6-flash:deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-10-10").getTime(),
            // DeepInfra current 35% discount verified 2026-10-24; callers keep the Novita quote.
            cost: {
                promptTextTokens: perMillion(0.091),
                promptCachedTokens: perMillion(0.00182),
                completionTextTokens: perMillion(0.182),
            },
        },
    },
    "xiaomi/mimo-v2.6-pro": {
        "xiaomi/mimo-v2.6-pro:deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-10-10").getTime(),
            // DeepInfra current discounted rates verified 2026-10-24. Callers keep the Novita quote.
            cost: {
                promptTextTokens: perMillion(0.387),
                promptCachedTokens: perMillion(0.00324),
                completionTextTokens: perMillion(0.783),
            },
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
        "deepseek/deepseek-v4.1-flash:fireworks": {
            supportedParameters: CHAT_PARAMETERS.fireworksReasoning,
            provider: "fireworks",
            addedDate: new Date("2026-10-12").getTime(),
            cost: {
                // Fireworks Standard rates (2026-10-12).
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.006),
                completionTextTokens: perMillion(1.2),
            },
        },
    },
    "deepseek/deepseek-v4.1-flash-1017": {
        "deepseek/deepseek-v4.1-flash-1017:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-10-18").getTime(),
            cost: {
                // DeepInfra current 51% promotion (2026-10-24), no announced end.
                promptTextTokens: perMillion(0.2) * 0.49,
                promptCachedTokens: perMillion(0.006) * 0.49,
                completionTextTokens: perMillion(0.6) * 0.49,
            },
        },
    },
    "minimax/minimax-m2.7": {
        "minimax/minimax-m2.7:openrouter:minimax": {
            supportedParameters: CHAT_PARAMETERS.openRouterMinimax27FirstParty,
            provider: "openrouter",
            addedDate: new Date("2026-09-23").getTime(),
            cost: {
                // OpenRouter MiniMax first-party FP8 rates (2026-09-23),
                // including the account's 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.3) * 1.055,
                promptCachedTokens: perMillion(0.06) * 1.055,
                completionTextTokens: perMillion(1.2) * 1.055,
            },
        },
    },
    "minimax/minimax-m3": {
        "minimax/minimax-m3:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            // https://deepinfra.com/MiniMaxAI/MiniMax-M3 (2026-10-07).
            cost: {
                promptTextTokens: perMillion(0.28),
                promptCachedTokens: perMillion(0.056),
                completionTextTokens: perMillion(1.1),
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
    "qwen/qwen3.8-27b": {
        "qwen/qwen3.8-27b:openrouter:reka-fp8": {
            supportedParameters: CHAT_PARAMETERS.qwen38Reka,
            provider: "openrouter",
            addedDate: new Date("2026-10-13").getTime(),
            cost: {
                // OpenRouter Reka FP8 rates (2026-10-13), including the
                // account's 5.5% credit-purchase fee. OpenRouter publishes one
                // prompt rate and no separate image/video rates.
                promptTextTokens: perMillion(0.04) * 1.055,
                promptCachedTokens: perMillion(0.02) * 1.055,
                promptImageTokens: perMillion(0.04) * 1.055,
                promptVideoTokens: perMillion(0.04) * 1.055,
                completionTextTokens: perMillion(2.2) * 1.055,
            },
        },
    },
    "qwen/qwen3.7-plus": {
        "qwen/qwen3.7-plus:alibaba": {
            provider: "alibaba",
            supportedParameters: CHAT_PARAMETERS.alibabaQwen,
            addedDate: new Date("2026-10-24").getTime(),
            // Direct Alibaba (International), limited-time 20% off list.
            // Explicit-cache reads cost 10% of input; recorded at the implicit 20%.
            cost: {
                promptTextTokens: perMillion(0.32),
                promptCachedTokens: perMillion(0.064),
                promptCacheWriteTokens: perMillion(0.4),
                promptImageTokens: perMillion(0.32),
                completionTextTokens: perMillion(1.28),
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(0.96),
                        promptCachedTokens: perMillion(0.192),
                        promptCacheWriteTokens: perMillion(1.2),
                        promptImageTokens: perMillion(0.96),
                        completionTextTokens: perMillion(3.84),
                    },
                },
                longContextAbove(256_000),
                {
                    long_context: {
                        label: "Long context (>256K)",
                        description:
                            "More than 256,000 prompt tokens; the higher rates apply to the whole request.",
                    },
                },
                "≤256K context",
                [
                    {
                        key: "context",
                        label: "Context",
                        unit: "tokens",
                        values: { "": "≤256K", long_context: ">256K" },
                    },
                ],
            ),
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
    "moonshotai/kimi-k3": {
        "moonshotai/kimi-k3:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            // https://deepinfra.com/moonshotai/Kimi-K3 (2026-10-07).
            cost: {
                promptTextTokens: perMillion(2.85),
                promptCachedTokens: perMillion(0.285),
                completionTextTokens: perMillion(14.25),
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
    "mistralai/mistral-large-4": {
        // Both routes use Mistral infrastructure; this covers gateway failures.
        "mistralai/mistral-large-4:vercel": {
            supportedParameters: CHAT_PARAMETERS.vercelMistralLarge4,
            provider: "vercel",
            addedDate: new Date("2026-10-06").getTime(),
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
                promptTextTokens: perMillion(0.2),
                promptImageTokens: perMillion(0.2),
                completionTextTokens: perMillion(0.4),
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
        "meta/llama-4-scout:openrouter:deepinfra-fp8-priority": {
            provider: "openrouter",
            addedDate: new Date("2026-10-19").getTime(),
            // DeepInfra FP8 priority, verified 2026-10-19. Callers keep the
            // primary quote; Pollinations absorbs the higher route cost.
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                promptImageTokens: perMillion(0.15) * 1.055,
                completionTextTokens: perMillion(0.45) * 1.055,
            },
        },
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
            priceMultiplier: 1,
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
    "anthropic/claude-haiku-5.5": {
        "anthropic/claude-haiku-5.5:aws": {
            priceMultiplier: 1,
            provider: "aws",
            addedDate: new Date("2026-10-15").getTime(),
        },
    },
    "anthropic/claude-opus-5.5": {
        "anthropic/claude-opus-5.5:aws": {
            provider: "aws",
            addedDate: new Date("2026-10-15").getTime(),
        },
    },
    "anthropic/claude-sonnet-5.5": {
        "anthropic/claude-sonnet-5.5:aws": {
            priceMultiplier: 1,
            provider: "aws",
            addedDate: new Date("2026-10-15").getTime(),
        },
    },
    "anthropic/claude-fable-5.1": {
        "anthropic/claude-fable-5.1:aws": {
            provider: "aws",
            addedDate: new Date("2026-10-15").getTime(),
        },
    },
    "anthropic/claude-sonnet-5": {
        // Anthropic's global rates equal the Bedrock global sheet (2026-10-24).
        "anthropic/claude-sonnet-5:anthropic": {
            provider: "anthropic",
            addedDate: new Date("2026-10-24").getTime(),
        },
    },
    "anthropic/claude-opus-5.5:fast": {
        "anthropic/claude-opus-5.5:fast:openrouter:anthropic-fast": {
            provider: "openrouter",
            addedDate: new Date("2026-10-24").getTime(),
            // OpenRouter's anthropic/fast endpoint, plus the 5.5% credit fee.
            cost: {
                promptTextTokens: perMillion(8) * 1.055,
                promptCachedTokens: perMillion(0.4) * 1.055,
                promptCacheWriteTokens: perMillion(10) * 1.055,
                completionTextTokens: perMillion(40) * 1.055,
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
        "meta/muse-glimmer-30b:openrouter:together": {
            supportedParameters: CHAT_PARAMETERS.openRouterMuseGlimmer,
            provider: "openrouter",
            addedDate: new Date("2026-09-23").getTime(),
            cost: {
                // OpenRouter Together rates (2026-09-23), including the
                // account's 5.5% credit-purchase fee. Costs more than the
                // primary; Phala was cheaper but rate-limited bursts.
                promptTextTokens: perMillion(0.35) * 1.055,
                promptCachedTokens: perMillion(0.04) * 1.055,
                promptImageTokens: perMillion(0.35) * 1.055,
                completionTextTokens: perMillion(1.5) * 1.055,
            },
        },
    },
    "meta/muse-wonder-1.0": {
        "meta/muse-wonder-1.0:vercel": {
            supportedParameters: CHAT_PARAMETERS.vercelMuseWonder,
            provider: "vercel",
            addedDate: new Date("2026-10-12").getTime(),
            // Vercel AI Gateway catalog rates (2026-10-12): base rates with no
            // OpenRouter fee. Same Meta-hosted model; covers OpenRouter
            // failures, not Meta outages.
            cost: {
                promptTextTokens: perMillion(4),
                promptCachedTokens: perMillion(0.2),
                promptImageTokens: perMillion(4),
                completionTextTokens: perMillion(20),
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
    "nvidia/nemotron-3.5-super-vl": {
        "nvidia/nemotron-3.5-super-vl:openrouter:together": {
            supportedParameters: CHAT_PARAMETERS.openRouterNemotronSuperVl,
            provider: "openrouter",
            addedDate: new Date("2026-10-15").getTime(),
            cost: {
                // OpenRouter Together rates (2026-10-15), including the account's
                // 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.15) * 1.055,
                promptCachedTokens: perMillion(0.02) * 1.055,
                completionTextTokens: perMillion(0.5) * 1.055,
            },
        },
    },
    "nvidia/nemotron-3-ultra": {
        "nvidia/nemotron-3-ultra:deepinfra": {
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
    "google/gemini-4-argon": {
        "google/gemini-4-argon:openrouter:ai-studio": {
            supportedParameters: CHAT_PARAMETERS.gemini35AiStudio,
            provider: "openrouter",
            priceMultiplier: 1,
            addedDate: new Date("2026-10-13").getTime(),
            // OpenRouter AI Studio promotional rates verified 2026-10-24,
            // including the 5.5% credit fee. Callers keep the Vertex quote.
            cost: {
                promptTextTokens: perMillion(2) * 1.055,
                promptCachedTokens: perMillion(0.1) * 1.055,
                promptCacheWriteTokens: perMillion(2) * 1.055,
                promptAudioTokens: perMillion(2) * 1.055,
                promptImageTokens: perMillion(2) * 1.055,
                promptVideoTokens: perMillion(2) * 1.055,
                completionTextTokens: perMillion(10) * 1.055,
            },
            // Reported explicit cache writes include five minutes of storage.
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14 * 1.055,
                storageCostPerMillionTokenHours: 2.25 * 1.055,
            }),
        },
    },
    "google/gemini-2.5-flash-lite": {
        "google/gemini-2.5-flash-lite:openrouter:ai-studio": {
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
    "google/gemini-2.5-flash-lite:search": {
        "google/gemini-2.5-flash-lite:search:vercel": {
            provider: "vercel",
            cost: {
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.01),
                promptCacheWriteTokens: perMillion(0.1),
                promptAudioTokens: perMillion(0.1),
                promptImageTokens: perMillion(0.1),
                promptVideoTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.4),
            },
            billing: VERCEL_EXA_SEARCH_BILLING,
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
                        promptImageTokens: perMillion(4.0) * 1.055,
                        promptVideoTokens: perMillion(4.0) * 1.055,
                        completionTextTokens: perMillion(18.0) * 1.055,
                    },
                },
                longContextAtLeast(200_000),
                {
                    long_context: {
                        label: "Long context (200K+)",
                        description:
                            "At least 200,000 prompt tokens; text, cached, cache-write, image, audio, video, and output rates increase.",
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
    "qwen/qwen3-vl-30b-a3b-instruct": {
        "qwen/qwen3-vl-30b-a3b-instruct:openrouter:deepinfra": {
            provider: "openrouter",
            priceMultiplier: 1,
            cost: {
                promptTextTokens: perMillion(0.15) * 1.055,
                completionTextTokens: perMillion(0.6) * 1.055,
            },
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
        "z-ai/glm-5.3:deepinfra": {
            supportedParameters: [
                ...CHAT_PARAMETERS.deepinfraReasoning.filter(
                    (parameter) =>
                        parameter !== "logprobs" &&
                        parameter !== "top_logprobs",
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
        },
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
    "z-ai/glm-5.3-flash": {
        "z-ai/glm-5.3-flash:openrouter": {
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
        },
    },
    "moonshotai/kimi-k2.7-code": {
        "moonshotai/kimi-k2.7-code:openrouter:streamlake": {
            supportedParameters: CHAT_PARAMETERS.openRouterKimiStreamLake,
            provider: "openrouter",
            addedDate: new Date("2026-09-23").getTime(),
            cost: {
                // OpenRouter StreamLake promo rates (2026-09-23; list
                // $0.95/$4.00), including the account's 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.7125) * 1.055,
                promptCachedTokens: perMillion(0.1425) * 1.055,
                promptCacheWriteTokens: perMillion(0.7125) * 1.055,
                promptImageTokens: perMillion(0.7125) * 1.055,
                completionTextTokens: perMillion(3.0) * 1.055,
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
    "deepseek/deepseek-v4-pro": {
        "deepseek/deepseek-v4-pro:openrouter:streamlake": {
            supportedParameters: CHAT_PARAMETERS.openRouterStreamLakeReasoning,
            provider: "openrouter",
            addedDate: new Date("2026-09-23").getTime(),
            cost: {
                // OpenRouter StreamLake 50% promo rates (2026-10-12; list
                // $1.32/$0.044/$3.96, no published end date), including the
                // account's 5.5% credit-purchase fee.
                promptTextTokens: perMillion(0.66) * 1.055,
                promptCachedTokens: perMillion(0.022) * 1.055,
                completionTextTokens: perMillion(1.98) * 1.055,
            },
        },
    },
    "z-ai/glm-5.2": {
        "z-ai/glm-5.2:deepinfra": {
            supportedParameters: CHAT_PARAMETERS.deepinfraReasoning,
            provider: "deepinfra",
            addedDate: new Date("2026-09-23").getTime(),
            cost: {
                // DeepInfra FP4 rates (2026-09-23): list $0.75/$2.40 with an
                // open-ended 25% discount.
                promptTextTokens: perMillion(0.5625),
                promptCachedTokens: perMillion(0.105),
                completionTextTokens: perMillion(1.8),
            },
        },
    },
} as const satisfies FallbackMap;
