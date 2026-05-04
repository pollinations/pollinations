import { HTTPException } from "hono/http-exception";
import { ensureUpstreamOk } from "@/error.ts";
import type { ContentPart, EmbeddingRequest, GeminiPart } from "./types.ts";

const MAX_MEDIA_SIZE = 20 * 1024 * 1024; // 20MB max per media item

export class EmbeddingInputError extends HTTPException {
    constructor(message: string) {
        super(400, { message });
    }
}

function isPrivateIpv4Address(address: string): boolean {
    const octets = address
        .split(".")
        .map((octet) => Number.parseInt(octet, 10));
    if (octets.length !== 4 || octets.some(Number.isNaN)) {
        return false;
    }
    const [a, b] = octets;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

function isPrivateIpv6Address(address: string): boolean {
    const normalized = address.toLowerCase().split("%", 2)[0];
    if (normalized === "::1") {
        return true;
    }
    if (normalized.startsWith("::ffff:")) {
        return isPrivateIpv4Address(normalized.slice(7));
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
        return true;
    }
    if (normalized.startsWith("fe")) {
        const firstHextet = Number.parseInt(normalized.slice(0, 4), 16);
        return (
            !Number.isNaN(firstHextet) &&
            firstHextet >= 0xfe80 &&
            firstHextet <= 0xfebf
        );
    }
    return false;
}

function isIpv4Address(address: string): boolean {
    const octets = address.split(".");
    return (
        octets.length === 4 &&
        octets.every((octet) => {
            if (!/^\d{1,3}$/.test(octet)) return false;
            const value = Number.parseInt(octet, 10);
            return value >= 0 && value <= 255;
        })
    );
}

function isPrivateHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
        normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized === "metadata.google.internal"
    ) {
        return true;
    }
    if (isIpv4Address(normalized)) {
        return isPrivateIpv4Address(normalized);
    }
    if (normalized.includes(":")) {
        return isPrivateIpv6Address(normalized);
    }
    return false;
}

function assertPublicUrl(url: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new EmbeddingInputError("Invalid media URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new EmbeddingInputError(
            `Unsupported media URL protocol: ${parsed.protocol}`,
        );
    }

    if (isPrivateHost(parsed.hostname)) {
        throw new EmbeddingInputError(
            `Blocked request to private/internal URL: ${parsed.hostname}`,
        );
    }

    return parsed;
}

function getPublicRedirectUrl(response: Response, baseUrl: URL): URL | null {
    const location = response.headers.get("location");
    if (!location) return null;

    const redirectUrl = new URL(location, baseUrl);
    if (isPrivateHost(redirectUrl.hostname)) {
        throw new EmbeddingInputError(
            `Blocked redirect to private/internal URL: ${location}`,
        );
    }
    return redirectUrl;
}

function assertMediaSize(label: string, byteLength: number): void {
    if (byteLength > MAX_MEDIA_SIZE) {
        throw new EmbeddingInputError(
            `${label} too large: ${byteLength} bytes (max ${MAX_MEDIA_SIZE})`,
        );
    }
}

function parseDataUrl(
    dataUrl: string,
    label: string,
): { mimeType: string; data: string } {
    const [meta, payload] = dataUrl.split(",", 2);
    if (!meta?.startsWith("data:") || !payload) {
        throw new EmbeddingInputError(
            `Invalid ${label.toLowerCase()} data URL`,
        );
    }

    const mimeType =
        meta.slice(5).split(";", 1)[0] || "application/octet-stream";
    const isBase64 = meta.includes(";base64");
    let buffer: Buffer;
    if (isBase64) {
        buffer = Buffer.from(payload, "base64");
    } else {
        try {
            buffer = Buffer.from(decodeURIComponent(payload), "utf8");
        } catch {
            throw new EmbeddingInputError(
                `Invalid ${label.toLowerCase()} data URL`,
            );
        }
    }

    assertMediaSize(label, buffer.byteLength);
    return { mimeType, data: buffer.toString("base64") };
}

function assertBase64MediaSize(label: string, data: string): void {
    const buffer = Buffer.from(data.replace(/\s+/g, ""), "base64");
    assertMediaSize(label, buffer.byteLength);
}

async function fetchMedia(
    url: string,
    label: string,
    redirects = 0,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const parsedUrl = assertPublicUrl(url);
    const response = await fetch(parsedUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
    });
    const redirectUrl = getPublicRedirectUrl(response, parsedUrl);
    if (redirectUrl) {
        if (redirects >= 3) {
            throw new EmbeddingInputError("Too many media URL redirects");
        }
        return fetchMedia(redirectUrl.toString(), label, redirects + 1);
    }
    if (!response.ok) {
        await ensureUpstreamOk(response, parsedUrl);
    }
    const cl = parseInt(response.headers.get("content-length") || "0", 10);
    if (Number.isFinite(cl)) {
        assertMediaSize(label, cl);
    }
    const buffer = await response.arrayBuffer();
    assertMediaSize(label, buffer.byteLength);
    const contentType =
        response.headers.get("content-type") || "application/octet-stream";
    return { buffer, contentType };
}

export async function inputToGeminiParts(
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
                const { mimeType, data } = parseDataUrl(url, "Image");
                parts.push({ inline_data: { mime_type: mimeType, data } });
            } else {
                const { buffer, contentType } = await fetchMedia(url, "Image");
                const base64 = Buffer.from(buffer).toString("base64");
                parts.push({
                    inline_data: { mime_type: contentType, data: base64 },
                });
            }
        } else if (part.type === "input_audio") {
            assertBase64MediaSize("Audio", part.input_audio.data);
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
                const parsedVideo = parseDataUrl(url, "Video");
                parts.push({
                    inline_data: {
                        mime_type: mime_type || parsedVideo.mimeType,
                        data: parsedVideo.data,
                    },
                });
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

export function normalizeInputs(
    input: EmbeddingRequest["input"],
): (string | ContentPart[])[] {
    if (typeof input === "string") {
        return [input];
    }

    if (!Array.isArray(input)) {
        return [[input]];
    }

    if (input.length === 0) {
        return [];
    }

    if (typeof input[0] === "string") {
        return input as string[];
    }

    return [input as ContentPart[]];
}
