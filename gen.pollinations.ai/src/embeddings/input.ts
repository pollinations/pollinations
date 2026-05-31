import { HTTPException } from "hono/http-exception";
import { HttpError } from "@/image/httpError.ts";
import { downloadImageAsBase64 } from "@/image/utils/imageDownload.ts";
import {
    assertAllowedRemoteMediaUrl,
    assertNoRemoteMediaRedirect,
    assertRemoteMediaContentLength,
    readRemoteMediaBytes,
} from "@/utils/remoteMedia.ts";
import { MAX_EMBEDDING_BATCH_SIZE } from "./limits.ts";
import type { ContentPart, EmbeddingRequest, GeminiPart } from "./types.ts";

export function badRequest(message: string): never {
    throw new HTTPException(400, { message });
}

async function fetchMedia(
    url: string,
): Promise<{ data: string; contentType: string }> {
    const parsed = assertAllowedRemoteMediaUrl(url);
    let response: Response;
    try {
        response = await fetch(parsed, { redirect: "manual" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        badRequest(`Failed to fetch media: ${message}`);
    }
    assertNoRemoteMediaRedirect(url, response);
    if (!response.ok) {
        badRequest(
            `Failed to fetch media: ${response.status} ${response.statusText}`,
        );
    }
    assertRemoteMediaContentLength(url, response);
    const contentType =
        response.headers.get("content-type") || "application/octet-stream";
    if (contentType && !contentType.startsWith("video/")) {
        badRequest(
            `Invalid content type for ${url}: received ${contentType}, expected video/*.`,
        );
    }
    const buffer = await readRemoteMediaBytes(response);
    return {
        data: Buffer.from(buffer).toString("base64"),
        contentType,
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
