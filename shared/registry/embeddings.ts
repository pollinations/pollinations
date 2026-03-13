import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ServiceDefinition } from "./registry";

// Embedding model IDs as returned by providers
type EmbeddingModelDefinitions = {
    "gemini-embedding-2": ServiceDefinition<"gemini-embedding-2-preview">;
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
        cost: [
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.2),
                promptImageTokens: perMillion(0.45),
                promptAudioTokens: perMillion(6.5),
            },
        ],
        description:
            "Gemini Embedding 2 - Multimodal embeddings for text, images, audio, video. 3072 dimensions, 8192 token limit.",
        inputModalities: ["text", "image", "audio"],
        outputModalities: ["embedding"],
        contextLength: 8192,
    },
};
