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
        "qwen3.8-27b-openrouter-ionstream": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.35),
                promptImageTokens: perMillion(0.35),
                promptVideoTokens: perMillion(0.35),
                completionTextTokens: perMillion(2.55),
            },
        },
        "qwen3.8-27b-openrouter-reka": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.35),
                promptImageTokens: perMillion(0.35),
                promptVideoTokens: perMillion(0.35),
                completionTextTokens: perMillion(2.55),
            },
        },
        "qwen3.8-27b-openrouter-akashml": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            cost: {
                promptTextTokens: perMillion(0.35),
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
            paidOnly: true,
        },
        "mistral-large-openrouter-mistral": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
            paidOnly: true,
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
        "claude-opus-4.7-openrouter-anthropic": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
        "claude-opus-4.7-openrouter-azure": {
            provider: "openrouter",
            addedDate: new Date("2026-09-01").getTime(),
        },
    },
} as const satisfies FallbackMap;
