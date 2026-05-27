import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

// Embedding model IDs as returned by providers
type EmbeddingModelDefinitions = {
    "gemini-2": ModelDefinition<"gemini-embedding-2-preview">;
    "openai-3-small": ModelDefinition<"text-embedding-3-small">;
    "openai-3-large": ModelDefinition<"text-embedding-3-large">;
    "cohere-embed-v4": ModelDefinition<"embed-v-4-0">;
    "qwen3-embedding-8b": ModelDefinition<"accounts/fireworks/models/qwen3-embedding-8b">;
};

export type EmbeddingServiceId = keyof EmbeddingModelDefinitions;
export type EmbeddingModelId =
    EmbeddingModelDefinitions[EmbeddingServiceId]["modelId"];

export const DEFAULT_EMBEDDING_MODEL: EmbeddingServiceId = "openai-3-small";

export const EMBEDDING_SERVICES: EmbeddingModelDefinitions = {
    "gemini-2": {
        aliases: ["embedding"],
        modelId: "gemini-embedding-2-preview",
        provider: "google",
        brand: "Google",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        paidOnly: true,
        priceMultiplier: 1.5,
        cost: {
            promptTextTokens: perMillion(0.2),
            promptImageTokens: perMillion(0.45),
            promptAudioTokens: perMillion(6.5),
            promptVideoTokens: perMillion(12),
        },
        description:
            "Gemini Embedding 2 - Multimodal Embeddings for Text, Images, Audio, and Video. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai-3-small": {
        aliases: ["embedding-small"],
        modelId: "text-embedding-3-small",
        provider: "openai",
        brand: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(0.02),
        },
        description:
            "Text Embedding 3 Small - Low-Cost Text Embeddings. 1536 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "openai-3-large": {
        aliases: ["embedding-large"],
        modelId: "text-embedding-3-large",
        provider: "openai",
        brand: "OpenAI",
        category: "embedding",
        addedDate: new Date("2026-05-08").getTime(),
        priceMultiplier: 1,
        cost: {
            promptTextTokens: perMillion(0.13),
        },
        description:
            "Text Embedding 3 Large - High-Quality Text Embeddings. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "cohere-embed-v4": {
        aliases: ["embed-v-4-0", "cohere-embed-v-4-0"],
        modelId: "embed-v-4-0",
        provider: "azure",
        brand: "Cohere",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1.5,
        // Azure Cohere retail rates (Global). Image-token billing also available
        // upstream ($0.47/1M Global text-img); we only expose text input for now.
        cost: {
            promptTextTokens: perMillion(0.12),
        },
        description:
            "Cohere Embed v4 - Multilingual text embeddings via Azure. 1536 dimensions, 128K context.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 128000,
    },
    "qwen3-embedding-8b": {
        aliases: ["qwen3-embedding"],
        modelId: "accounts/fireworks/models/qwen3-embedding-8b",
        provider: "fireworks",
        brand: "Qwen",
        category: "embedding",
        addedDate: new Date("2026-05-26").getTime(),
        priceMultiplier: 1.5,
        cost: {
            promptTextTokens: perMillion(0.1),
        },
        description:
            "Qwen3 Embedding 8B - Multilingual text embeddings via Fireworks. 4096 dimensions.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 32768,
    },
};
