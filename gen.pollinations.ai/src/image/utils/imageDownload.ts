import { Buffer } from "node:buffer";
import { detectImageMimeType } from "@shared/image-mime.ts";
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

    let buffer: Buffer;
    try {
        buffer = Buffer.from(await imageResponse.arrayBuffer());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpError(
            `Failed to read image ${imageUrl}: ${message}`,
            400,
            { validation: true },
        );
    }

    const mimeType = detectImageMimeType(buffer);
    if (!mimeType) {
        throw new HttpError(`Unsupported image format from ${imageUrl}`, 400, {
            validation: true,
        });
    }
    return { buffer, mimeType };
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
