export type GeminiTaskType =
    | "SEMANTIC_SIMILARITY"
    | "CLASSIFICATION"
    | "CLUSTERING"
    | "RETRIEVAL_DOCUMENT"
    | "RETRIEVAL_QUERY"
    | "CODE_RETRIEVAL_QUERY"
    | "QUESTION_ANSWERING"
    | "FACT_VERIFICATION";

export interface TextInput {
    type: "text";
    text: string;
}

export interface ImageUrlInput {
    type: "image_url";
    image_url: { url: string };
}

export interface AudioInput {
    type: "input_audio";
    input_audio: { data: string; format: string };
}

export interface VideoUrlInput {
    type: "video_url";
    video_url: { url: string; mime_type?: string };
}

export type ContentPart =
    | TextInput
    | ImageUrlInput
    | AudioInput
    | VideoUrlInput;

export interface EmbeddingRequest {
    model: string;
    input: string | string[] | ContentPart | ContentPart[];
    dimensions?: number;
    task_type?: GeminiTaskType;
}

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
