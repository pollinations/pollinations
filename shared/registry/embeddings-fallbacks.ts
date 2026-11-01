import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";

export const EMBEDDING_FALLBACKS = {
    "openai/text-embedding-3-small": {
        "openai/text-embedding-3-small:openai": {
            provider: "openai",
            priceMultiplier: 1,
            cost: { promptTextTokens: perMillion(0.02) },
        },
    },
    "qwen/qwen3-embedding-8b": {
        "qwen/qwen3-embedding-8b:fireworks": {
            provider: "fireworks",
            cost: { promptTextTokens: perMillion(0.1) },
        },
    },
    "openai/text-embedding-3-large": {
        "openai/text-embedding-3-large:openai": {
            provider: "openai",
            priceMultiplier: 1,
            cost: { promptTextTokens: perMillion(0.13) },
        },
    },
    "cohere/embed-v4.0": {
        "cohere/embed-v4.0:aws": {
            provider: "aws",
            priceMultiplier: 1,
            cost: {
                promptTextTokens: perMillion(0.12),
                promptImageTokens: perMillion(0.12),
            },
        },
    },
} as const satisfies FallbackMap;
