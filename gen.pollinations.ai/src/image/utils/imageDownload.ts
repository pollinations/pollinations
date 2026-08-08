import { Buffer } from "node:buffer";
import { detectImageMimeType } from "@shared/image-mime.ts";
import { fetchUserImage } from "@/userImage.ts";
import { HttpError } from "../httpError.ts";

export function bufferToUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
    return new Uint8Array(buffer);
}

export function base64ToBuffer(base64: string): Buffer {
    const input = base64
        .replace(/^data:[^,]+,/, "")
        .replace(/\s/g, "")
        .replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/_-]*$/.test(input)) {
        throw new HttpError("Invalid base64 image response", 502);
    }
    return Buffer.from(input, "base64");
}

export function detectMimeType(buffer: Uint8Array): string {
    return detectImageMimeType(buffer) ?? "image/jpeg";
}

export function readImageDimensions(
    buffer: Uint8Array,
    mimeType: string,
): { width: number; height: number } | null {
    const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
    );
    const dimensions = (width: number, height: number) =>
        width > 0 && height > 0 ? { width, height } : null;

    if (mimeType === "image/png" && buffer.length >= 24) {
        return dimensions(view.getUint32(16), view.getUint32(20));
    }
    if (mimeType === "image/gif" && buffer.length >= 10) {
        return dimensions(view.getUint16(6, true), view.getUint16(8, true));
    }
    if (mimeType === "image/bmp" && buffer.length >= 26) {
        return dimensions(
            Math.abs(view.getInt32(18, true)),
            Math.abs(view.getInt32(22, true)),
        );
    }
    if (mimeType === "image/webp" && buffer.length >= 30) {
        const chunk = String.fromCharCode(...buffer.subarray(12, 16));
        if (chunk === "VP8X") {
            const width =
                1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
            const height =
                1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
            return dimensions(width, height);
        }
        if (chunk === "VP8 " && buffer.length >= 30) {
            return dimensions(
                view.getUint16(26, true) & 0x3fff,
                view.getUint16(28, true) & 0x3fff,
            );
        }
        if (chunk === "VP8L" && buffer[20] === 0x2f) {
            const bits = view.getUint32(21, true);
            return dimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
        }
    }
    if (mimeType === "image/jpeg" && buffer.length >= 4) {
        let offset = 2;
        while (offset + 8 < buffer.length) {
            if (buffer[offset] !== 0xff) {
                offset++;
                continue;
            }
            const marker = buffer[offset + 1];
            if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
                offset += 2;
                continue;
            }
            const segmentLength = view.getUint16(offset + 2);
            if (
                segmentLength < 2 ||
                offset + 2 + segmentLength > buffer.length
            ) {
                return null;
            }
            if (
                [
                    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
                    0xcd, 0xce, 0xcf,
                ].includes(marker) &&
                segmentLength >= 7
            ) {
                return dimensions(
                    view.getUint16(offset + 7),
                    view.getUint16(offset + 5),
                );
            }
            offset += 2 + segmentLength;
        }
    }
    return null;
}

/**
 * Downloads one user-supplied image for a generation request.
 *
 * Redirects are followed here, unlike the text path: an image URL pasted into
 * the `image` parameter is routinely a shortener or a CDN that redirects, and
 * refusing those would reject URLs that work today.
 */
export async function downloadUserImage(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string }> {
    const { bytes, mimeType } = await fetchUserImage(imageUrl, { signal });
    return { buffer: Buffer.from(bytes), mimeType };
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
