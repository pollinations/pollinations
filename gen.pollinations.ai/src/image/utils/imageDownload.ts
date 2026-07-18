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
