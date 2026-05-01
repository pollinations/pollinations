import { HttpError } from "../httpError.ts";

export function bufferToUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(buffer.length);
    bytes.set(buffer);
    return bytes;
}

export function base64ToBuffer(base64: string): Buffer {
    const normalized = base64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return Buffer.from(bytes);
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
        throw new HttpError(`Failed to fetch image: ${message}`, 400);
    }

    if (!imageResponse.ok) {
        throw new HttpError(
            `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
            400,
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
