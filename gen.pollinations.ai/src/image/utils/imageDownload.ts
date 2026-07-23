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

export async function toDataUri(url: string): Promise<string> {
    const { buffer, mimeType } = await downloadUserImage(url);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Extracts dimensions directly from PNG, JPEG, and WEBP buffers without heavy external dependencies.
 */
export function getImageDimensions(
    buffer: Buffer | Uint8Array,
): { width: number; height: number } | undefined {
    try {
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 24) return undefined;
        const dataView = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        );

        // PNG (bytes 16-23 store big-endian uint32 width & height)
        if (
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47
        ) {
            return {
                width: dataView.getUint32(16, false),
                height: dataView.getUint32(20, false),
            };
        }
        // JPEG (SOF0/SOF1/SOF2 marker detection)
        if (bytes[0] === 0xff && bytes[1] === 0xd8) {
            let offset = 2;
            while (offset < bytes.length - 8) {
                if (bytes[offset] !== 0xff) break;
                const marker = bytes[offset + 1];
                if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
                    return {
                        width: dataView.getUint16(offset + 7, false),
                        height: dataView.getUint16(offset + 5, false),
                    };
                }
                offset += 2 + dataView.getUint16(offset + 2, false);
            }
        }
        // WEBP
        if (
            bytes.length >= 30 &&
            bytes[0] === 0x52 &&
            bytes[1] === 0x49 &&
            bytes[2] === 0x46 &&
            bytes[3] === 0x46 &&
            bytes[8] === 0x57 &&
            bytes[9] === 0x45 &&
            bytes[10] === 0x42 &&
            bytes[11] === 0x50
        ) {
            const vp8 = bytes[15];
            if (vp8 === 0x20) {
                // VP8 lossy format
                return {
                    width: dataView.getUint16(26, true) & 0x3fff,
                    height: dataView.getUint16(28, true) & 0x3fff,
                };
            } else if (vp8 === 0x4c) {
                // VP8L lossless format: width (14 bits) and height (14 bits) are stored in bytes 21-24.
                // 14-bit width = 1 + (((byte22 & 0x3F) << 8) | byte21)
                // 14-bit height = 1 + (((byte24 & 0x0F) << 10) | (byte23 << 2) | ((byte22 & 0xC0) >> 6))
                const b1 = bytes[21];
                const b2 = bytes[22];
                const b3 = bytes[23];
                const b4 = bytes[24];
                const width = 1 + (((b2 & 0x3f) << 8) | b1);
                const height =
                    1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
                return { width, height };
            } else if (vp8 === 0x58) {
                // VP8X extended format
                const width =
                    1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
                const height =
                    1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
                return { width, height };
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * Derives dimensions from either an external URL or a base64 data: URI.
 */
export async function getImageDimensionsFromUrl(
    url: string,
): Promise<{ width: number; height: number } | undefined> {
    try {
        let buffer: Buffer;
        if (url.startsWith("data:")) {
            buffer = base64ToBuffer(url);
        } else {
            const { buffer: fetched } = await downloadUserImage(url);
            buffer = fetched;
        }
        return getImageDimensions(buffer);
    } catch (error) {
        console.warn(
            "Failed to extract image dimensions for aspect ratio inference:",
            error,
        );
        return undefined;
    }
}
