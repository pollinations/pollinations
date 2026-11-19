import { EMBEDDING_FALLBACKS } from "./embeddings-fallbacks";
import { mergeFallbacks } from "./merge-fallbacks";
import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

export type EmbeddingServiceId = keyof typeof EMBEDDING_SERVICES;

export const DEFAULT_EMBEDDING_MODEL: EmbeddingServiceId =
    "openai/text-embedding-3-small";

const EMBEDDING_BASE_SERVICES = {
    "google/gemini-embedding-2": {
        aliases: ["embedding", "gemini-2"],
        provider: "google",
        publisher: "Google",
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
            "Match text, images, audio and video by meaning, such as finding a clip from a written description.",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai/text-embedding-3-small": {
        aliases: ["embedding-small", "openai-3-small"],
        provider: "azure",
        publisher: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        // Provider retires this route on 2028-02-09.
        priceMultiplier: 0.75,
        paidOnly: false,
        cost: {
            promptTextTokens: perMillion(0.02),
        },
        title: "Text Embedding 3 Small",
        description:
            "Find passages with similar meanings using compact, low-cost text embeddings.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai/text-embedding-3-large": {
        aliases: ["embedding-large", "openai-3-large"],
        provider: "azure",
        publisher: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        // Provider retires this route on 2028-02-09.
        priceMultiplier: 0.75,
        paidOnly: false,
        cost: {
            promptTextTokens: perMillion(0.13),
        },
        title: "Text Embedding 3 Large",
        description:
            "Find relevant passages across languages with text embeddings of up to 3,072 dimensions.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "cohere/embed-v4.0": {
        aliases: [
            "embed-v-4-0",
            "cohere-embed-v-4-0",
            "cohere-embed-v4",
            "embed-v4.0",
        ],
        provider: "azure",
        publisher: "Cohere",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 0.75,
        paidOnly: false,
        // Azure Cohere retail rates (Global).
        cost: {
            promptTextTokens: perMillion(0.12),
            promptImageTokens: perMillion(0.47),
        },
        title: "Embed 4",
        description:
            "Match images with descriptions in multiple languages, even in long documents.",
        inputModalities: ["text", "image"],
        outputModalities: ["embedding"],
        contextLength: 128000,
    },
    "qwen/qwen3-embedding-8b": {
        aliases: ["qwen3-embedding", "qwen3-embedding-8b"],
        provider: "deepinfra",
        publisher: "Qwen",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1,
        paidOnly: true,
        cost: {
            promptTextTokens: perMillion(0.01),
        },
        title: "Qwen3 Embedding 8B",
        description:
            "Search long documents across languages and choose how much detail to store in each text embedding.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        // Verified on the live DeepInfra route; its catalog still lists 32K.
        contextLength: 40960,
    },
} as const satisfies Record<string, ModelDefinition>;

export const EMBEDDING_SERVICES = mergeFallbacks(
    EMBEDDING_BASE_SERVICES,
    EMBEDDING_FALLBACKS,
);
