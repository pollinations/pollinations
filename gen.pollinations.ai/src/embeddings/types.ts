import type { z } from "zod";
import type {
    ContentPartSchema,
    CreateEmbeddingRequestSchema,
} from "@/schemas/embeddings.ts";

export type EmbeddingRequest = z.infer<typeof CreateEmbeddingRequestSchema>;
export type ContentPart = z.infer<typeof ContentPartSchema>;
export type GeminiTaskType = NonNullable<EmbeddingRequest["task_type"]>;

export interface GeminiPart {
    text?: string;
    inline_data?: { mime_type: string; data: string };
}

export type GeminiModality = "TEXT" | "IMAGE" | "AUDIO" | "VIDEO";

export interface ModalityTokenCount {
    modality?: GeminiModality;
    tokenCount?: number;
}

export interface GeminiEmbedResponse {
    embedding: { values: number[] };
    usageMetadata?: {
        promptTokenCount?: number;
        totalTokenCount?: number;
        promptTokensDetails?: ModalityTokenCount[];
    };
}
