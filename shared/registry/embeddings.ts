import { perMillion } from "./price-helpers";
import type { ModelDefinition } from "./registry";

// Embedding model IDs as returned by providers
type EmbeddingModelDefinitions = {
    "gemini-2": ModelDefinition<"gemini-embedding-2-preview">;
    "openai-3-small": ModelDefinition<"text-embedding-3-small">;
    "openai-3-large": ModelDefinition<"text-embedding-3-large">;
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
        priceMultiplier: 1.5,
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
        priceMultiplier: 1.5,
        cost: {
            promptTextTokens: perMillion(0.13),
        },
        description:
            "Text Embedding 3 Large - High-Quality Text Embeddings. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
};
