import { defineCostVariants, longContextAtLeast } from "./cost-variants";
import { openRouterGeminiBilling } from "./gemini-billing";
import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";

/** Exact-checkpoint provider routes used when a text model's primary fails. */
export const TEXT_FALLBACKS = {
    "deepseek/deepseek-v4-flash": {
        "deepseek/deepseek-v4-flash:fallback": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.08),
                promptCachedTokens: perMillion(0.016),
                completionTextTokens: perMillion(0.18),
            },
        },
    },
    "minimax/minimax-m2.7": {
        "minimax/minimax-m2.7:fallback": {
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
        "qwen/qwen3.8-2.4t-a95b:fallback": {
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
        "qwen/qwen3.8-27b:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.35),
                promptCachedTokens: perMillion(0.05),
                promptImageTokens: perMillion(0.35),
                promptVideoTokens: perMillion(0.35),
                completionTextTokens: perMillion(2.55),
            },
        },
    },
    "moonshotai/kimi-k2.6": {
        "moonshotai/kimi-k2.6:fallback": {
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
        "meta/llama-3.3-70b-instruct:fallback": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.32),
            },
        },
    },
    "mistralai/mistral-large-3": {
        "mistralai/mistral-large-3:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemma-4-26b-a4b-it": {
        "google/gemma-4-26b-a4b-it:fallback": {
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
        "google/gemma-4-31b-it:fallback": {
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
        "anthropic/claude-opus-4.7:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "meta/llama-4-scout": {
        "meta/llama-4-scout:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                promptImageTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.3),
            },
        },
    },
    "x-ai/grok-4.20": {
        "x-ai/grok-4.20:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.2),
                promptImageTokens: perMillion(1.25),
                completionTextTokens: perMillion(2.5),
            },
            ...defineCostVariants(
                {
                    long_context: {
                        promptTextTokens: perMillion(2.5),
                        promptCachedTokens: perMillion(0.4),
                        promptImageTokens: perMillion(2.5),
                        completionTextTokens: perMillion(5),
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
        "x-ai/grok-4.3:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.25),
                promptCachedTokens: perMillion(0.2),
                promptImageTokens: perMillion(1.25),
                completionTextTokens: perMillion(2.5),
            },
        },
    },
    "anthropic/claude-haiku-4.5": {
        "anthropic/claude-haiku-4.5:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "anthropic/claude-fable-5": {
        "anthropic/claude-fable-5:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "meta/muse-glimmer-30b": {
        "meta/muse-glimmer-30b:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.04),
                promptImageTokens: perMillion(0.3),
                completionTextTokens: perMillion(1.2),
            },
        },
    },
    "nvidia/nemotron-3.5-lightning": {
        "nvidia/nemotron-3.5-lightning:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(0.25),
            },
        },
    },
    "mistralai/mistral-small-4": {
        "mistralai/mistral-small-4:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.165),
                promptCachedTokens: perMillion(0.0165),
                promptImageTokens: perMillion(0.165),
                completionTextTokens: perMillion(0.66),
            },
        },
    },
    "google/gemini-3.7-flash": {
        "google/gemini-3.7-flash:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.35),
                promptCachedTokens: perMillion(0.135),
                promptCacheWriteTokens: perMillion(1.35),
                promptAudioTokens: perMillion(1.35),
                promptImageTokens: perMillion(1.35),
                promptVideoTokens: perMillion(1.35),
                completionTextTokens: perMillion(6.75),
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14,
                storageCostPerMillionTokenHours: 0.9,
            }),
        },
    },
    "google/gemini-2.5-flash-lite": {
        "google/gemini-2.5-flash-lite:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "google/gemini-3.5-flash-lite": {
        "google/gemini-3.5-flash-lite:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.15),
                promptCachedTokens: perMillion(0.015),
                promptCacheWriteTokens: perMillion(0.15),
                promptAudioTokens: perMillion(0.15),
                promptImageTokens: perMillion(0.15),
                promptVideoTokens: perMillion(0.15),
                completionTextTokens: perMillion(1.25),
            },
            billing: openRouterGeminiBilling({
                searchCostPerThousandRequests: 14,
                storageCostPerMillionTokenHours: 0.5,
            }),
        },
    },
    "google/gemini-3.1-pro-preview": {
        "google/gemini-3.1-pro-preview:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen/qwen3-vl-235b-a22b-thinking": {
        "qwen/qwen3-vl-235b-a22b-thinking:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.98),
                promptImageTokens: perMillion(0.98),
                completionTextTokens: perMillion(3.95),
                completionReasoningTokens: perMillion(3.95),
            },
        },
    },
    "z-ai/glm-5.3": {
        "z-ai/glm-5.3:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.26),
                promptCachedTokens: perMillion(0.234),
                completionTextTokens: perMillion(3.96),
            },
        },
    },
    "moonshotai/kimi-k2.7-code": {
        "moonshotai/kimi-k2.7-code:fallback": {
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
        "qwen/qwen3-coder-next:fallback": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.18),
                promptCachedTokens: perMillion(0.036),
                completionTextTokens: perMillion(0.9),
            },
        },
    },
} as const satisfies FallbackMap;
