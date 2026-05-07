import { HTTPException } from "hono/http-exception";
import { ensureUpstreamOk } from "@/error.ts";
import type { ContentPart, EmbeddingRequest, GeminiPart } from "./types.ts";

function isBlockedHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.includes(":")) return true;
    const parts = host.split(".").map(Number);
    return (
        parts.length === 4 &&
        parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)
    );
}

async function fetchMedia(
    url: string,
): Promise<{ data: string; contentType: string }> {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new HTTPException(400, {
            message: `Unsupported media URL protocol: ${parsed.protocol}`,
        });
    }
    if (parsed.username || parsed.password || isBlockedHost(parsed.hostname)) {
        throw new HTTPException(400, {
            message: `Blocked request to private/internal URL: ${parsed.hostname}`,
        });
    }
    const response = await fetch(parsed, { redirect: "error" });
    await ensureUpstreamOk(response, parsed);
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
        throw new HTTPException(400, { message: "Invalid data URL" });
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
        return { inline_data: { mime_type: mimeOverride || mimeType, data } };
    }
    const { data, contentType } = await fetchMedia(url);
    return { inline_data: { mime_type: mimeOverride || contentType, data } };
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
            parts.push(await urlToInlineData(part.image_url.url));
        } else if (part.type === "input_audio") {
            parts.push({
                inline_data: {
                    mime_type: `audio/${part.input_audio.format || "mp3"}`,
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

export function normalizeInputs(
    input: EmbeddingRequest["input"],
): (string | ContentPart[])[] {
    if (typeof input === "string") return [input];
    if (!Array.isArray(input)) return [[input]];
    if (input.length === 0) return [];
    if (typeof input[0] === "string") return input as string[];
    return [input as ContentPart[]];
}
