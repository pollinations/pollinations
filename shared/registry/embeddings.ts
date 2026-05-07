import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

// Embedding model IDs as returned by providers
type EmbeddingModelDefinitions = {
    "gemini-embedding-2": ModelDefinition<"gemini-embedding-2-preview">;
    "text-embedding-3-small": ModelDefinition<"text-embedding-3-small">;
    "text-embedding-3-large": ModelDefinition<"text-embedding-3-large">;
};

export type EmbeddingServiceId = keyof EmbeddingModelDefinitions;
export type EmbeddingModelId =
    EmbeddingModelDefinitions[EmbeddingServiceId]["modelId"];

export const DEFAULT_EMBEDDING_MODEL: EmbeddingServiceId = "gemini-embedding-2";

export const EMBEDDING_SERVICES: EmbeddingModelDefinitions = {
    "gemini-embedding-2": {
        aliases: ["gemini-embedding", "embedding"],
        modelId: "gemini-embedding-2-preview",
        provider: "google",
        brand: "Google",
        category: "embedding",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2),
                promptImageTokens: perMillion(0.45),
                promptAudioTokens: perMillion(6.5),
                promptVideoTokens: perMillion(12),
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3),
                promptImageTokens: perMillion(0.675),
                promptAudioTokens: perMillion(9.75),
                promptVideoTokens: perMillion(18),
            },
        ],
        description:
            "Gemini Embedding 2 - Multimodal embeddings for text, images, audio, and video. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text", "image", "audio", "video"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "text-embedding-3-small": {
        aliases: ["azure-embedding-small", "embedding-small"],
        modelId: "text-embedding-3-small",
        provider: "azure",
        brand: "OpenAI",
        category: "embedding",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.02),
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.03),
            },
        ],
        description:
            "OpenAI Embedding 3 Small - Low-Cost Text Embeddings. 1536 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
    "text-embedding-3-large": {
        aliases: ["azure-embedding-large", "embedding-large"],
        modelId: "text-embedding-3-large",
        provider: "azure",
        brand: "OpenAI",
        category: "embedding",
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.13),
            },
        ],
        price: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.195),
            },
        ],
        description:
            "OpenAI Embedding 3 Large - High-Quality Text Embeddings. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
};
