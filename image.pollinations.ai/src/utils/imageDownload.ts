import { fileTypeFromBuffer } from "file-type";
import { HttpError } from "../httpError.ts";

/**
 * Download a user-supplied image URL into a Buffer, with magic-byte MIME detection.
 *
 * Throws HttpError(400) when the URL fails — this is for fetching images the *user*
 * gave us (input images for editing, reference images, etc.), so a fetch failure
 * is client error. Use this everywhere we download user-supplied URLs; do NOT use
 * it for downloading provider-generated results (those failures are server errors).
 *
 * Some CDNs (e.g. Telegram) return application/octet-stream, so we sniff magic
 * bytes instead of trusting the content-type header.
 */
export async function downloadUserImage(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ buffer: Buffer; mimeType: string }> {
    const imageResponse = await fetch(imageUrl, { signal });

    if (!imageResponse.ok) {
        throw new HttpError(
            `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
            400,
        );
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const fileType = await fileTypeFromBuffer(buffer);
    const mimeType = fileType?.mime || "image/jpeg";

    return { buffer, mimeType };
}
