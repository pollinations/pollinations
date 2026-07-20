import { HTTPException } from "hono/http-exception";
import { HttpError } from "@/image/httpError.ts";
import { downloadImageAsBase64 } from "@/image/utils/imageDownload.ts";
import { MAX_EMBEDDING_BATCH_SIZE } from "./limits.ts";
import type {
    ContentPart,
    EmbeddingRequest,
    GeminiPart,
    GeminiTaskType,
} from "./types.ts";

const GEMINI_TASK_PREFIXES: Record<GeminiTaskType, string> = {
    SEMANTIC_SIMILARITY: "task: sentence similarity | query: ",
    CLASSIFICATION: "task: classification | query: ",
    CLUSTERING: "task: clustering | query: ",
    RETRIEVAL_DOCUMENT: "title: none | text: ",
    RETRIEVAL_QUERY: "task: search result | query: ",
    CODE_RETRIEVAL_QUERY: "task: code retrieval | query: ",
    QUESTION_ANSWERING: "task: question answering | query: ",
    FACT_VERIFICATION: "task: fact checking | query: ",
};

export function badRequest(message: string): never {
    throw new HTTPException(400, { message });
}

function parseRemoteMediaUrl(url: string): URL {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            badRequest(`Unsupported media URL protocol: ${parsed.protocol}`);
        }
        return parsed;
    } catch (error) {
        if (error instanceof HTTPException) throw error;
        badRequest(`Invalid media URL: ${url}`);
    }
}

async function fetchMedia(
    url: string,
): Promise<{ data: string; contentType: string }> {
    const parsed = parseRemoteMediaUrl(url);
    let response: Response;
    try {
        response = await fetch(parsed);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        badRequest(`Failed to fetch media: ${message}`);
    }
    if (!response.ok) {
        badRequest(
            `Failed to fetch media: ${response.status} ${response.statusText}`,
        );
    }
    const buffer = await response.arrayBuffer();
    return {
        data: Buffer.from(buffer).toString("base64"),
        contentType:
            response.headers.get("content-type") || "application/octet-stream",
    };
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
    const [meta, payload] = dataUrl.split(",", 2);
    if (!meta?.startsWith("data:") || !payload) {
        badRequest("Invalid data URL");
    }
    const mimeType =
        meta.slice(5).split(";", 1)[0] || "application/octet-stream";
    const data = meta.includes(";base64")
        ? payload
        : Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");
    return { mimeType, data };
}

async function urlToInlineData(
    url: string,
    mimeOverride?: string,
): Promise<GeminiPart> {
    if (url.startsWith("data:")) {
        const { mimeType, data } = parseDataUrl(url);
        return { inlineData: { mimeType: mimeOverride || mimeType, data } };
    }
    const { data, contentType } = await fetchMedia(url);
    return { inlineData: { mimeType: mimeOverride || contentType, data } };
}

async function imageUrlToInlineData(url: string): Promise<GeminiPart> {
    if (url.startsWith("data:")) return urlToInlineData(url);
    try {
        const { base64, mimeType } = await downloadImageAsBase64(url);
        return { inlineData: { mimeType, data: base64 } };
    } catch (error) {
        if (error instanceof HttpError) badRequest(error.message);
        throw error;
    }
}

export async function inputToGeminiParts(
    input: string | ContentPart | ContentPart[],
): Promise<GeminiPart[]> {
    if (typeof input === "string") return [{ text: input }];
    const items = Array.isArray(input) ? input : [input];
    const parts: GeminiPart[] = [];
    for (const part of items) {
        if (typeof part === "string") {
            parts.push({ text: part });
        } else if (part.type === "text") {
            parts.push({ text: part.text });
        } else if (part.type === "image_url") {
            parts.push(await imageUrlToInlineData(part.image_url.url));
        } else if (part.type === "input_audio") {
            parts.push({
                inlineData: {
                    mimeType: `audio/${part.input_audio.format}`,
                    data: part.input_audio.data,
                },
            });
        } else if (part.type === "video_url") {
            parts.push(
                await urlToInlineData(
                    part.video_url.url,
                    part.video_url.mime_type,
                ),
            );
        }
    }
    return parts;
}

export function applyGeminiTaskInstruction(
    parts: GeminiPart[],
    taskType?: GeminiTaskType,
): GeminiPart[] {
    if (!taskType) return parts;
    if (parts.some((part) => part.inlineData)) {
        badRequest("task_type is only supported for Gemini text input");
    }

    const prefix = GEMINI_TASK_PREFIXES[taskType];
    const firstTextIndex = parts.findIndex((part) => part.text !== undefined);
    if (firstTextIndex === -1) return [{ text: prefix.trimEnd() }, ...parts];

    return parts.map((part, index) =>
        index === firstTextIndex
            ? { ...part, text: `${prefix}${part.text}` }
            : part,
    );
}

type CohereImageInput = {
    image: string;
    text?: string;
};

export async function inputToCohereImage(
    input: string | ContentPart | ContentPart[],
): Promise<CohereImageInput | undefined> {
    if (typeof input === "string") return undefined;

    const parts = Array.isArray(input) ? input : [input];
    const textParts: string[] = [];
    let image: string | undefined;

    for (const part of parts) {
        if (part.type === "text") {
            textParts.push(part.text);
            continue;
        }
        if (part.type !== "image_url") {
            badRequest("Cohere Embed v4 supports text and image input only");
        }
        if (image) {
            badRequest("Cohere Embed v4 supports one image per input");
        }
        const { inlineData } = await imageUrlToInlineData(part.image_url.url);
        if (!inlineData) {
            throw new Error("Image conversion did not produce inline data");
        }
        image = `data:${inlineData.mimeType};base64,${inlineData.data}`;
    }

    if (!image) return undefined;
    return {
        image,
        ...(textParts.length > 0 ? { text: textParts.join("\n") } : {}),
    };
}

export function inputToText(
    input: string | ContentPart | ContentPart[],
): string {
    if (typeof input === "string") {
        return input;
    }

    const parts = Array.isArray(input) ? input : [input];
    const textParts: string[] = [];

    for (const part of parts) {
        if (part.type !== "text") {
            badRequest("Model supports text input only");
        }

        textParts.push(part.text);
    }

    return textParts.join("\n");
}

export function normalizeInputs(
    input: EmbeddingRequest["input"],
): (string | ContentPart[])[] {
    if (typeof input === "string") return [input];
    if (!Array.isArray(input)) return [[input]];
    if (input.length === 0) return [];
    if (typeof input[0] === "string") {
        if (input.length > MAX_EMBEDDING_BATCH_SIZE) {
            badRequest(
                `Embedding batch size exceeds ${MAX_EMBEDDING_BATCH_SIZE} inputs`,
            );
        }
        return input as string[];
    }
    return [input as ContentPart[]];
}
