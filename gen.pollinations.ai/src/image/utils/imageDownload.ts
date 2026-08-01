import { Buffer } from "node:buffer";
import { HttpError } from "../httpError.ts";

export function bufferToUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
    return new Uint8Array(buffer);
}

export function base64ToBuffer(base64: string): Buffer {
    const input = base64
        .replace(/^data:[^,]+,/, "")
        .replace(/\s/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .replace(/=+$/, "");
    const buffer = Buffer.alloc(Math.floor((input.length * 6) / 8));
    let bits = 0;
    let value = 0;
    let index = 0;

    for (const char of input) {
        const digit =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(
                char,
            );
        if (digit < 0) {
            throw new HttpError("Invalid base64 image response", 502);
        }
        value = (value << 6) | digit;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            buffer[index] = (value >> bits) & 0xff;
            index += 1;
        }
    }

    return buffer;
}

export function detectMimeType(buffer: Uint8Array): string {
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return "image/png";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return "image/webp";
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return "image/gif";
    }
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
    return "image/jpeg";
}

export async function downloadUserImage(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string }> {
    let imageResponse: Response;
    try {
        imageResponse = await fetch(imageUrl, { signal });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpError(
            `Failed to fetch image ${imageUrl}: ${message}`,
            400,
            { validation: true },
        );
    }

    if (!imageResponse.ok) {
        throw new HttpError(
            `Failed to fetch image ${imageUrl}: ${imageResponse.status} ${imageResponse.statusText}`,
            400,
            { validation: true },
        );
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    return { buffer, mimeType: detectMimeType(buffer) };
}

export async function downloadImageAsBase64(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
    const { buffer, mimeType } = await downloadUserImage(imageUrl, signal);
    return { base64: buffer.toString("base64"), mimeType };
}

/**
 * Download a user-supplied image and return it inlined as a base64 data URI.
 * Some providers (Replicate, DashScope) fetch input URLs server-side and choke
 * on query strings, redirects, or missing extensions — downloading here and
 * passing data URIs avoids that.
 */
export async function toDataUri(url: string): Promise<string> {
    const { buffer, mimeType } = await downloadUserImage(url);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function readImageDimensions(
    buffer: Uint8Array,
    mimeType = detectMimeType(buffer),
): { width: number; height: number } | null {
    if (mimeType === "image/png" && buffer.length >= 24) {
        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
        );
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        return width > 0 && height > 0 ? { width, height } : null;
    }
    if (mimeType === "image/gif" && buffer.length >= 10) {
        const width = buffer[6] | (buffer[7] << 8);
        const height = buffer[8] | (buffer[9] << 8);
        return width > 0 && height > 0 ? { width, height } : null;
    }
    if (mimeType === "image/jpeg") {
        for (let offset = 2; offset + 9 < buffer.length; ) {
            if (buffer[offset] !== 0xff) {
                offset += 1;
                continue;
            }
            const marker = buffer[offset + 1];
            offset += 2;
            if (
                marker === 0xd8 ||
                marker === 0xd9 ||
                (marker >= 0xd0 && marker <= 0xd7)
            ) {
                continue;
            }
            if (offset + 2 > buffer.length) break;
            const segmentLength = (buffer[offset] << 8) | buffer[offset + 1];
            if (segmentLength < 2 || offset + segmentLength > buffer.length)
                break;
            if (
                (marker >= 0xc0 && marker <= 0xc3) ||
                (marker >= 0xc5 && marker <= 0xc7) ||
                (marker >= 0xc9 && marker <= 0xcb) ||
                (marker >= 0xcd && marker <= 0xcf)
            ) {
                if (segmentLength >= 7) {
                    const height =
                        (buffer[offset + 3] << 8) | buffer[offset + 4];
                    const width =
                        (buffer[offset + 5] << 8) | buffer[offset + 6];
                    return width > 0 && height > 0 ? { width, height } : null;
                }
                break;
            }
            offset += segmentLength;
        }
    }
    if (mimeType === "image/webp" && buffer.length >= 30) {
        const subtype = String.fromCharCode(
            buffer[12],
            buffer[13],
            buffer[14],
            buffer[15],
        );
        if (subtype === "VP8X") {
            const width =
                1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
            const height =
                1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
            return width > 0 && height > 0 ? { width, height } : null;
        }
    }
    return null;
}

const DIMENSIONS_CACHE_TTL_SECONDS = 86_400;
const DIMENSIONS_CACHE_PREFIX = "image:dimensions:v1:";

type ImageDimensions = { width: number; height: number };

async function dimensionsCacheKey(imageUrl: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(imageUrl),
    );
    const bytes = new Uint8Array(digest);
    return `${DIMENSIONS_CACHE_PREFIX}${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function cachedDimensions(value: unknown): ImageDimensions | null {
    if (!value || typeof value !== "object") return null;
    const { width, height } = value as Record<string, unknown>;
    return typeof width === "number" &&
        typeof height === "number" &&
        Number.isInteger(width) &&
        Number.isInteger(height) &&
        width > 0 &&
        height > 0
        ? { width, height }
        : null;
}

function decodeDataUri(
    dataUri: string,
): { buffer: Buffer; mimeType: string } | null {
    const match = dataUri.match(/^data:([^;,]+)[^,]*,(.*)$/s);
    if (!match || !match[1].startsWith("image/")) return null;
    try {
        const encoded = match[2];
        const buffer = dataUri.includes(";base64,")
            ? base64ToBuffer(`data:${match[1]};base64,${encoded}`)
            : Buffer.from(decodeURIComponent(encoded));
        return { buffer, mimeType: match[1] };
    } catch {
        return null;
    }
}

export async function getSourceImageDimensions(
    imageUrl: string,
    kv?: KVNamespace,
): Promise<ImageDimensions | null> {
    const inlineImage = imageUrl.startsWith("data:")
        ? decodeDataUri(imageUrl)
        : null;
    if (inlineImage) {
        return readImageDimensions(inlineImage.buffer, inlineImage.mimeType);
    }

    const cacheKey = kv ? await dimensionsCacheKey(imageUrl) : undefined;
    if (kv && cacheKey) {
        const cached = cachedDimensions(await kv.get(cacheKey, "json"));
        if (cached) return cached;
    }

    try {
        const { buffer, mimeType } = await downloadUserImage(imageUrl);
        const dimensions = readImageDimensions(buffer, mimeType);
        if (kv && cacheKey && dimensions) {
            await kv.put(cacheKey, JSON.stringify(dimensions), {
                expirationTtl: DIMENSIONS_CACHE_TTL_SECONDS,
            });
        }
        return dimensions;
    } catch {
        return null;
    }
}
