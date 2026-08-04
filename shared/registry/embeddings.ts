import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export type EmbeddingServiceId = keyof typeof EMBEDDING_SERVICES;

export const DEFAULT_EMBEDDING_MODEL: EmbeddingServiceId =
    "openai/text-embedding-3-small";

export const EMBEDDING_SERVICES = {
    "google/gemini-embedding-2": {
        aliases: ["embedding", "gemini-2"],
        provider: "google",
        brand: "Google",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        paidOnly: true,
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(0.2),
            promptImageTokens: perMillion(0.45),
            promptAudioTokens: perMillion(6.5),
            promptVideoTokens: perMillion(12),
        },
        title: "Gemini Embedding 2",
        description:
            "Turns text, images, audio and video into vectors for semantic search. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai/text-embedding-3-small": {
        aliases: ["embedding-small", "openai-3-small"],
        provider: "azure",
        brand: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: perMillion(0.02),
        },
        title: "Text Embedding 3 Small",
        description:
            "Low-cost text vectors for search and similarity. 1536 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai/text-embedding-3-large": {
        aliases: ["embedding-large", "openai-3-large"],
        provider: "azure",
        brand: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        priceMultiplier: 0.75,
        cost: {
            promptTextTokens: perMillion(0.13),
        },
        title: "Text Embedding 3 Large",
        description:
            "High-quality text vectors for demanding search. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "embed-v4.0": {
        aliases: ["embed-v-4-0", "cohere-embed-v-4-0", "cohere-embed-v4"],
        provider: "azure",
        brand: "Cohere",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 0.75,
        // Azure Cohere retail rates (Global).
        cost: {
            promptTextTokens: perMillion(0.12),
            promptImageTokens: perMillion(0.47),
        },
        title: "Cohere Embed v4",
        description:
            "Multilingual text and image vectors. 1536 dimensions, 128K context.",
        inputModalities: ["text", "image"],
        outputModalities: ["embedding"],
        contextLength: 128000,
    },
    "qwen/qwen3-embedding-8b": {
        aliases: ["qwen3-embedding", "qwen3-embedding-8b"],
        provider: "fireworks",
        brand: "Qwen",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(0.1),
        },
        title: "Qwen3 Embedding 8B",
        description:
            "Multilingual text vectors. 4096 dimensions, 40,960-token context.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        // Match the effective context advertised by the Fireworks deployment.
        contextLength: 40960,
    },
} as const satisfies Record<string, ModelDefinition>;
