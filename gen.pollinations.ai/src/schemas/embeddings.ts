import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { z } from "zod";

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
        data: z
            .string()
            .meta({ description: "Base64-encoded audio data. Max 180s." }),
        format: z.string().meta({
            description: "Audio format (e.g. mp3, wav)",
            example: "mp3",
        }),
    }),
});

const VideoUrlContentPartSchema = z.object({
    type: z.literal("video_url"),
    video_url: z.object({
        url: z.string().meta({
            description:
                "Video URL or base64 data URI. Supports mp4 and mpeg. Max 120s.",
            example: "https://example.com/video.mp4",
        }),
        mime_type: z.string().optional().meta({
            description:
                "Video MIME type (auto-detected if omitted). Supported: video/mp4, video/mpeg.",
            example: "video/mp4",
        }),
    }),
});

export const ContentPartSchema = z.union([
    TextContentPartSchema,
    ImageUrlContentPartSchema,
    AudioContentPartSchema,
    VideoUrlContentPartSchema,
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
                    "Input text or content parts to embed. Supports strings, arrays of strings, or multimodal content parts (text, image_url, input_audio, video_url).",
                example: "Hello world",
            }),
        dimensions: z.number().int().min(128).max(3072).optional().meta({
            description:
                "Output embedding dimensions (128-3072). Default: 3072.",
            example: 768,
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
        encoding_format: z.enum(["float", "base64"]).default("float").meta({
            description:
                "Output encoding for the embedding vector. `base64` packs Float32 little-endian like OpenAI.",
            example: "float",
        }),
    })
    .meta({ $id: "CreateEmbeddingRequest" });

// --- Response schemas ---

const EmbeddingObjectSchema = z.object({
    object: z.literal("embedding"),
    embedding: z.union([z.array(z.number()), z.string()]).meta({
        description:
            "Embedding vector — array of floats, or base64-encoded Float32 (little-endian) when `encoding_format=base64`.",
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
