import type { Usage } from "../shared/registry/registry.ts";
import { buildUsageHeaders } from "../shared/registry/usage-headers.ts";
import googleCloudAuth from "./auth/googleCloudAuth.ts";

const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const VERTEX_REGION = "us-central1";

// Token estimate constants (Gemini docs: ~258 tokens per image, ~32 tokens/sec for audio)
const IMAGE_TOKEN_ESTIMATE = 258;
const AUDIO_TOKEN_ESTIMATE = 500;

// Gemini embedding task types (passed through if provided)
type GeminiTaskType =
    | "SEMANTIC_SIMILARITY"
    | "CLASSIFICATION"
    | "CLUSTERING"
    | "RETRIEVAL_DOCUMENT"
    | "RETRIEVAL_QUERY"
    | "CODE_RETRIEVAL_QUERY"
    | "QUESTION_ANSWERING"
    | "FACT_VERIFICATION";

// --- OpenAI-compatible request types ---

interface TextInput {
    type: "text";
    text: string;
}

interface ImageUrlInput {
    type: "image_url";
    image_url: { url: string };
}

interface AudioInput {
    type: "input_audio";
    input_audio: { data: string; format: string };
}

type ContentPart = TextInput | ImageUrlInput | AudioInput;

interface EmbeddingRequest {
    model: string;
    input: string | string[] | ContentPart | ContentPart[];
    dimensions?: number;
    encoding_format?: "float" | "base64";
    task_type?: GeminiTaskType;
}

// --- Gemini API types ---

interface GeminiPart {
    text?: string;
    inline_data?: { mime_type: string; data: string };
}

interface GeminiEmbedResponse {
    embedding: { values: number[] };
    usageMetadata?: {
        promptTokenCount?: number;
        totalTokenCount?: number;
    };
}

// --- Transform: OpenAI input → Gemini parts ---

interface ParsedInput {
    parts: GeminiPart[];
    textTokenEstimate: number;
    imageTokenEstimate: number;
    audioTokenEstimate: number;
}

async function inputToGeminiParts(
    input: string | ContentPart | ContentPart[],
): Promise<ParsedInput> {
    const result: ParsedInput = {
        parts: [],
        textTokenEstimate: 0,
        imageTokenEstimate: 0,
        audioTokenEstimate: 0,
    };

    if (typeof input === "string") {
        result.parts.push({ text: input });
        result.textTokenEstimate = Math.ceil(input.length / 4);
        return result;
    }

    const parts = Array.isArray(input) ? input : [input];

    for (const part of parts) {
        if (typeof part === "string") {
            result.parts.push({ text: part });
            result.textTokenEstimate += Math.ceil(part.length / 4);
        } else if (part.type === "text") {
            result.parts.push({ text: part.text });
            result.textTokenEstimate += Math.ceil(part.text.length / 4);
        } else if (part.type === "image_url") {
            const { url } = part.image_url;
            if (url.startsWith("data:")) {
                const [meta, data] = url.split(",", 2);
                const mimeType = meta.split(":")[1].split(";")[0];
                result.parts.push({
                    inline_data: { mime_type: mimeType, data },
                });
            } else {
                // Block internal/metadata URLs to prevent SSRF
                const parsed = new URL(url);
                const hostname = parsed.hostname;
                if (
                    hostname === "localhost" ||
                    hostname.startsWith("127.") ||
                    hostname.startsWith("10.") ||
                    hostname.startsWith("192.168.") ||
                    hostname.startsWith("169.254.") ||
                    hostname === "metadata.google.internal" ||
                    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
                ) {
                    throw new Error(
                        `Blocked request to private/internal URL: ${hostname}`,
                    );
                }

                const response = await fetch(url);
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString("base64");
                const contentType =
                    response.headers.get("content-type") ||
                    "application/octet-stream";
                result.parts.push({
                    inline_data: { mime_type: contentType, data: base64 },
                });
            }
            result.imageTokenEstimate += IMAGE_TOKEN_ESTIMATE;
        } else if (part.type === "input_audio") {
            const mimeType = `audio/${part.input_audio.format || "mp3"}`;
            result.parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: part.input_audio.data,
                },
            });
            result.audioTokenEstimate += AUDIO_TOKEN_ESTIMATE;
        }
    }

    return result;
}

// --- Call Gemini embedContent API via Vertex AI v1beta1 ---

async function callGeminiEmbed(
    modelId: string,
    parts: GeminiPart[],
    taskType?: GeminiTaskType,
    outputDimensionality?: number,
): Promise<GeminiEmbedResponse> {
    if (!GOOGLE_PROJECT_ID) {
        throw new Error("GOOGLE_PROJECT_ID not configured");
    }

    const accessToken = await googleCloudAuth.getAccessToken();
    if (!accessToken) {
        throw new Error(
            "Google Cloud authentication failed — missing or invalid credentials",
        );
    }

    const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1beta1/projects/${GOOGLE_PROJECT_ID}/locations/${VERTEX_REGION}/publishers/google/models/${modelId}:embedContent`;

    const body = {
        content: { parts },
        embedContentConfig: {
            ...(taskType && { taskType }),
            ...(outputDimensionality && { outputDimensionality }),
        },
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Gemini embedding API error (${response.status}): ${errorText}`,
        );
    }

    return response.json() as Promise<GeminiEmbedResponse>;
}

// --- Normalize input to array of individual embedding inputs ---

function normalizeInputs(
    input: EmbeddingRequest["input"],
): (string | ContentPart[])[] {
    if (typeof input === "string") {
        return [input];
    }

    if (!Array.isArray(input)) {
        // Single ContentPart → wrap as single multimodal embedding
        return [[input]];
    }

    if (input.length === 0) {
        return [];
    }

    // Array of strings → each string is a separate embedding
    if (typeof input[0] === "string") {
        return input as string[];
    }

    // Array of ContentParts → single multimodal embedding
    return [input as ContentPart[]];
}

// --- Main handler ---

export async function generateEmbeddings(
    request: EmbeddingRequest,
): Promise<Response> {
    const { model, input, dimensions, task_type } = request;
    const modelId = model;

    const inputs = normalizeInputs(input);

    if (inputs.length === 0) {
        return new Response(
            JSON.stringify({
                object: "list",
                data: [],
                model: modelId,
                usage: { prompt_tokens: 0, total_tokens: 0 },
            }),
            { headers: { "Content-Type": "application/json" } },
        );
    }

    // Collect per-input results first, then sum (avoids race condition in Promise.all)
    const results = await Promise.all(
        inputs.map(async (singleInput, index) => {
            const parsed = await inputToGeminiParts(singleInput);
            const result = await callGeminiEmbed(
                modelId,
                parsed.parts,
                task_type,
                dimensions,
            );

            // Use actual token count from Gemini when available, fall back to estimate
            const textTokens =
                result.usageMetadata?.promptTokenCount ??
                parsed.textTokenEstimate;

            return {
                object: "embedding" as const,
                embedding: result.embedding.values,
                index,
                textTokens,
                imageTokens: parsed.imageTokenEstimate,
                audioTokens: parsed.audioTokenEstimate,
            };
        }),
    );

    const embeddings = results.map(({ object, embedding, index }) => ({
        object,
        embedding,
        index,
    }));

    const totalTextTokens = results.reduce((s, r) => s + r.textTokens, 0);
    const totalImageTokens = results.reduce((s, r) => s + r.imageTokens, 0);
    const totalAudioTokens = results.reduce((s, r) => s + r.audioTokens, 0);
    const promptTokens = totalTextTokens + totalImageTokens + totalAudioTokens;

    // Build usage headers per modality for correct billing
    const usage: Usage = {};
    if (totalTextTokens > 0) usage.promptTextTokens = totalTextTokens;
    if (totalImageTokens > 0) usage.promptImageTokens = totalImageTokens;
    if (totalAudioTokens > 0) usage.promptAudioTokens = totalAudioTokens;

    const usageHeaders = buildUsageHeaders(modelId, usage);

    const responseBody = {
        object: "list",
        data: embeddings,
        model: modelId,
        usage: {
            prompt_tokens: promptTokens,
            total_tokens: promptTokens,
        },
    };

    return new Response(JSON.stringify(responseBody), {
        headers: {
            "Content-Type": "application/json",
            ...usageHeaders,
        },
    });
}
