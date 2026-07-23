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

/**
 * Extracts dimensions directly from PNG, JPEG, and WEBP buffers.
 * Gracefully returns undefined for unsupported formats.
 */
export function getImageDimensions(buffer: Buffer | Uint8Array): { width: number; height: number } | undefined {
    try {
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 24) return undefined;
        const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        // PNG
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
            return { width: dataView.getUint32(16, false), height: dataView.getUint32(20, false) };
        }
        // JPEG
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            let offset = 2;
            while (offset < bytes.length - 8) {
                if (bytes[offset] !== 0xFF) break;
                const marker = bytes[offset + 1];
                if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
                    return { width: dataView.getUint16(offset + 7, false), height: dataView.getUint16(offset + 5, false) };
                }
                offset += 2 + dataView.getUint16(offset + 2, false);
            }
        }
        // WEBP
        if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            const vp8 = bytes[15];
            if (vp8 === 0x20) { // VP8 
                return { width: dataView.getUint16(26, true) & 0x3FFF, height: dataView.getUint16(28, true) & 0x3FFF };
            }
            if (vp8 === 0x4C) { // VP8L
                const b1 = bytes[21];
                const b2 = bytes[22];
                const b3 = bytes[23];
                const b4 = bytes[24];
                const width = 1 + (((b2 & 0x3F) << 8) | b1);
                const height = 1 + (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));
                return { width, height };
            }
            if (vp8 === 0x58) { // VP8X
                const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
                const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
                return { width, height };
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export async function getImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number } | undefined> {
    try {
        let buffer: Buffer;
        if (url.startsWith("data:")) {
            buffer = base64ToBuffer(url);
        } else {
            const { buffer: fetched } = await downloadUserImage(url);
            buffer = fetched;
        }
        return getImageDimensions(buffer);
    } catch {
        return undefined;
    }
}