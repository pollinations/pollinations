import { z } from "zod";
import { DEFAULT_EMBEDDING_MODEL } from "../../../shared/registry/embeddings.ts";

// --- Request schemas ---

const TextContentPartSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});

const ImageUrlContentPartSchema = z.object({
    type: z.literal("image_url"),
    image_url: z.object({
        url: z.string().meta({
            description: "Image URL or base64 data URI",
            example: "https://example.com/image.jpg",
        }),
    }),
});

const AudioContentPartSchema = z.object({
    type: z.literal("input_audio"),
    input_audio: z.object({
        data: z.string().meta({ description: "Base64-encoded audio data" }),
        format: z.string().meta({
            description: "Audio format (e.g. mp3, wav)",
            example: "mp3",
        }),
    }),
});

const ContentPartSchema = z.union([
    TextContentPartSchema,
    ImageUrlContentPartSchema,
    AudioContentPartSchema,
]);

export const CreateEmbeddingRequestSchema = z
    .object({
        model: z.string().default(DEFAULT_EMBEDDING_MODEL).meta({
            description: "Embedding model to use",
            example: "gemini-embedding-2",
        }),
        input: z
            .union([
                z.string(),
                z.array(z.string()),
                ContentPartSchema,
                z.array(ContentPartSchema),
            ])
            .meta({
                description:
                    "Input text or content parts to embed. Supports strings, arrays of strings, or multimodal content parts (text, image_url, input_audio).",
                example: "Hello world",
            }),
        dimensions: z.number().int().min(1).max(3072).optional().meta({
            description: "Output embedding dimensions (1-3072). Default: 3072.",
            example: 768,
        }),
        encoding_format: z
            .enum(["float", "base64"])
            .optional()
            .default("float")
            .meta({
                description: "Encoding format for the embedding values",
            }),
        task_type: z
            .enum([
                "SEMANTIC_SIMILARITY",
                "CLASSIFICATION",
                "CLUSTERING",
                "RETRIEVAL_DOCUMENT",
                "RETRIEVAL_QUERY",
                "CODE_RETRIEVAL_QUERY",
                "QUESTION_ANSWERING",
                "FACT_VERIFICATION",
            ])
            .optional()
            .meta({
                description:
                    "Gemini-specific task type hint for optimized embeddings",
                example: "RETRIEVAL_QUERY",
            }),
    })
    .meta({ $id: "CreateEmbeddingRequest" });

// --- Response schemas ---

const EmbeddingObjectSchema = z.object({
    object: z.literal("embedding"),
    embedding: z.array(z.number()).meta({
        description: "The embedding vector",
    }),
    index: z.number().int().meta({
        description: "Index of the embedding in the list",
    }),
});

const EmbeddingUsageSchema = z.object({
    prompt_tokens: z.number().int(),
    total_tokens: z.number().int(),
});

export const CreateEmbeddingResponseSchema = z
    .object({
        object: z.literal("list"),
        data: z.array(EmbeddingObjectSchema),
        model: z.string(),
        usage: EmbeddingUsageSchema,
    })
    .meta({ $id: "CreateEmbeddingResponse" });
