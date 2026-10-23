import type { FallbackMap } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";

export const EMBEDDING_FALLBACKS = {
    "qwen/qwen3-embedding-8b": {
        "qwen/qwen3-embedding-8b:fireworks": {
            provider: "fireworks",
            cost: { promptTextTokens: perMillion(0.1) },
        },
    },
    "cohere/embed-v4.0": {
        "cohere/embed-v4.0:azure:sweden": { provider: "azure" },
    },
} as const satisfies FallbackMap;
