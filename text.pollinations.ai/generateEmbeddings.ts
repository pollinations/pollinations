import { buildUsageHeaders } from "../shared/registry/usage-headers.ts";
import googleCloudAuth from "./auth/googleCloudAuth.ts";

const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const VERTEX_REGION = "us-central1";

const MAX_MEDIA_SIZE = 20 * 1024 * 1024; // 20MB max for fetched media (images/videos)

/**
 * Block internal/metadata URLs to prevent SSRF.
 * Throws if the URL points to a private or internal network address.
 */
function assertPublicUrl(url: string): URL {
    const parsed = new URL(url);
    const h = parsed.hostname;
    if (
        h === "localhost" ||
        h === "::1" ||
        h === "0.0.0.0" ||
        h.startsWith("127.") ||
        h.startsWith("10.") ||
        h.startsWith("192.168.") ||
        h.startsWith("169.254.") ||
        h === "metadata.google.internal" ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        /^f[cd]/i.test(h) ||     // IPv6 ULA fc00::/7
        /^fe[89ab]/i.test(h) ||  // IPv6 link-local fe80::/10
        /^::ffff:/i.test(h)      // IPv4-mapped IPv6
    ) {
        throw new Error(`Blocked request to private/internal URL: ${h}`);
    }
    return parsed;
}

/**
 * Fetch a media URL with SSRF protection and size limits.
 * Returns the raw buffer and content-type header.
 */
async function fetchMedia(
    url: string,
    label: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    assertPublicUrl(url);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const cl = parseInt(response.headers.get("content-length") || "0", 10);
    if (cl > MAX_MEDIA_SIZE) {
        throw new Error(
            `${label} too large: ${cl} bytes (max ${MAX_MEDIA_SIZE})`,
        );
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_MEDIA_SIZE) {
        throw new Error(
            `${label} too large: ${buffer.byteLength} bytes (max ${MAX_MEDIA_SIZE})`,
        );
    }
    const contentType =
        response.headers.get("content-type") || "application/octet-stream";
    return { buffer, contentType };
}

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

interface VideoUrlInput {
    type: "video_url";
    video_url: { url: string; mime_type?: string };
}

type ContentPart = TextInput | ImageUrlInput | AudioInput | VideoUrlInput;

interface EmbeddingRequest {
    model: string;
    input: string | string[] | ContentPart | ContentPart[];
    dimensions?: number;
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

async function inputToGeminiParts(
    input: string | ContentPart | ContentPart[],
): Promise<GeminiPart[]> {
    const parts: GeminiPart[] = [];

    if (typeof input === "string") {
        parts.push({ text: input });
        return parts;
    }

    const items = Array.isArray(input) ? input : [input];

    for (const part of items) {
        if (typeof part === "string") {
            parts.push({ text: part });
        } else if (part.type === "text") {
            parts.push({ text: part.text });
        } else if (part.type === "image_url") {
            const { url } = part.image_url;
            if (url.startsWith("data:")) {
                const [meta, data] = url.split(",", 2);
                const mimeType = meta.split(":")[1].split(";")[0];
                parts.push({ inline_data: { mime_type: mimeType, data } });
            } else {
                const { buffer, contentType } = await fetchMedia(url, "Image");
                const base64 = Buffer.from(buffer).toString("base64");
                parts.push({
                    inline_data: { mime_type: contentType, data: base64 },
                });
            }
        } else if (part.type === "input_audio") {
            const mimeType = `audio/${part.input_audio.format || "mp3"}`;
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: part.input_audio.data,
                },
            });
        } else if (part.type === "video_url") {
            const { url, mime_type } = part.video_url;
            if (url.startsWith("data:")) {
                const [meta, data] = url.split(",", 2);
                const mimeType = mime_type || meta.split(":")[1].split(";")[0];
                parts.push({ inline_data: { mime_type: mimeType, data } });
            } else {
                const { buffer, contentType } = await fetchMedia(url, "Video");
                const base64 = Buffer.from(buffer).toString("base64");
                parts.push({
                    inline_data: {
                        mime_type: mime_type || contentType,
                        data: base64,
                    },
                });
            }
        }
    }

    return parts;
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
        signal: AbortSignal.timeout(30_000),
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

    // Process in chunks to avoid saturating Vertex AI with concurrent requests
    const EMBED_CONCURRENCY = 10;
    const results: { object: "embedding"; embedding: number[]; index: number; tokens: number }[] = [];
    for (let i = 0; i < inputs.length; i += EMBED_CONCURRENCY) {
        const chunk = inputs.slice(i, i + EMBED_CONCURRENCY);
        const chunkResults = await Promise.all(
            chunk.map(async (singleInput, j) => {
                const parts = await inputToGeminiParts(singleInput);
                const result = await callGeminiEmbed(
                    modelId,
                    parts,
                    task_type,
                    dimensions,
                );
                return {
                    object: "embedding" as const,
                    embedding: result.embedding.values,
                    index: i + j,
                    tokens: result.usageMetadata?.promptTokenCount ?? 0,
                };
            }),
        );
        results.push(...chunkResults);
    }

    const embeddings = results.map(({ object, embedding, index }) => ({
        object,
        embedding,
        index,
    }));

    const promptTokens = results.reduce((s, r) => s + r.tokens, 0);

    const usageHeaders = buildUsageHeaders(modelId, {
        promptTextTokens: promptTokens,
    });

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
