import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { validateEmbeddingModel } from "../utils/models.js";

const contentPartSchema = z.union([
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
        type: z.literal("image_url"),
        image_url: z.object({ url: z.string() }),
    }),
    z.object({
        type: z.literal("input_audio"),
        input_audio: z.object({ data: z.string(), format: z.string() }),
    }),
    z.object({
        type: z.literal("video_url"),
        video_url: z.object({
            url: z.string(),
            mime_type: z.string().optional(),
        }),
    }),
]);

async function createEmbeddings(params, context) {
    requireApiKey(context);

    if (params.model) {
        const validation = await validateEmbeddingModel(params.model, context);
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                    "Use listModels with type=embedding to see all available models.",
            );
        }
    }

    const result = await fetchJsonWithAuth(
        buildUrl("/v1/embeddings"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        },
        context,
    );
    return createMCPResponse([createTextContent(result, true)]);
}

export const embeddingTools = [
    [
        "createEmbeddings",
        "Create OpenAI-compatible text or multimodal embeddings through POST /v1/embeddings.",
        {
            input: z
                .union([
                    z.string(),
                    z.array(z.string()).max(32),
                    contentPartSchema,
                    z.array(contentPartSchema),
                ])
                .describe(
                    "Text, up to 32 strings, or text/image/audio/video content parts",
                ),
            model: z
                .string()
                .optional()
                .describe(
                    "Embedding model. Use listModels with type=embedding",
                ),
            dimensions: z.number().int().min(128).max(4096).optional(),
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
                .optional(),
            input_type: z.enum(["query", "document"]).optional(),
            encoding_format: z.enum(["float", "base64"]).optional(),
        },
        createEmbeddings,
    ],
];
