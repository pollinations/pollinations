import { defineCostVariants, longContextAtLeast } from "./cost-variants";
import { openRouterGeminiBilling } from "./gemini-billing";
import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";

/** Exact-checkpoint provider routes used when a text model's primary fails. */
export const TEXT_FALLBACKS = {
    deepseek: {
        "deepseek-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.08),
                promptCachedTokens: perMillion(0.016),
                completionTextTokens: perMillion(0.18),
            },
        },
    },
    "minimax-m2.7": {
        "minimax-m2.7-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.25),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(1),
            },
        },
    },
    "qwen3.8-2.4t-a95b": {
        "qwen3.8-2.4t-a95b-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(2),
                promptCachedTokens: perMillion(0.2),
                completionTextTokens: perMillion(6),
            },
        },
    },
    "qwen3.8-27b": {
        "qwen3.8-27b-openrouter-akashml": {
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
    kimi: {
        "kimi-deepinfra": {
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
    llama: {
        "llama-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.32),
            },
        },
    },
    "mistral-large": {
        "mistral-large-openrouter-zdr": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    gemma: {
        "gemma-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.07),
                promptImageTokens: perMillion(0.07),
                completionTextTokens: perMillion(0.34),
            },
        },
    },
    "gemma-4-31b": {
        "gemma-4-31b-deepinfra": {
            provider: "deepinfra",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.13),
                promptImageTokens: perMillion(0.13),
                completionTextTokens: perMillion(0.38),
            },
        },
    },
    "claude-opus-4.7": {
        "claude-opus-4.7-openrouter-vertex": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "llama-scout": {
        "llama-scout-openrouter-deepinfra": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                promptImageTokens: perMillion(0.1),
                completionTextTokens: perMillion(0.3),
            },
        },
    },
    grok: {
        "grok-openrouter-xai-zdr": {
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
    "grok-large": {
        "grok-large-openrouter-xai-zdr": {
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
    "claude-fast": {
        "claude-fast-openrouter-vertex": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "claude-fable-5": {
        "claude-fable-5-openrouter-vertex": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "muse-glimmer": {
        "muse-glimmer-openrouter-parasail": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.3),
                promptCachedTokens: perMillion(0.04),
                promptImageTokens: perMillion(0.3),
                completionTextTokens: perMillion(1.1),
            },
        },
    },
    "nemotron-3.5-lightning": {
        "nemotron-3.5-lightning-openrouter-coreweave": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.1),
                promptCachedTokens: perMillion(0.05),
                completionTextTokens: perMillion(0.25),
            },
        },
    },
    mistral: {
        "mistral-openrouter-eu": {
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
    gemini: {
        "gemini-openrouter-ai-studio-priority": {
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
    "gemini-fast": {
        "gemini-fast-openrouter-ai-studio": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "gemini-flash-lite-3.5": {
        "gemini-flash-lite-3.5-openrouter-ai-studio-flex": {
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
    "gemini-large": {
        "gemini-large-openrouter-ai-studio": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
    "qwen-vision-pro": {
        "qwen-vision-pro-openrouter-novita": {
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
    "glm-5.3": {
        "glm-5.3-openrouter-friendli": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(1.26),
                promptCachedTokens: perMillion(0.234),
                completionTextTokens: perMillion(3.96),
            },
        },
    },
    "kimi-code": {
        "kimi-code-deepinfra": {
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
    "qwen-coder-large": {
        "qwen-coder-large-openrouter-streamlake": {
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
