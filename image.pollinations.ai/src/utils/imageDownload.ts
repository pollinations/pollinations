import { fileTypeFromBuffer } from "file-type";
import { HttpError } from "../httpError.ts";

/**
 * Download a user-supplied image URL into a Buffer, with magic-byte MIME detection.
 *
 * Throws HttpError(400) on any fetch failure — non-OK status, network/DNS/TLS
 * errors, malformed URLs, etc. This is for fetching images the *user* gave us
 * (input images for editing, reference images), so a fetch failure is client
 * error. Do NOT use this for downloading provider-generated results.
 *
 * Some CDNs (e.g. Telegram) return application/octet-stream, so we sniff magic
 * bytes instead of trusting content-type. SVG has no magic bytes; we sniff the
 * leading text for `<svg`/`<?xml` and fall back to image/jpeg otherwise.
 */
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
    const fileType = await fileTypeFromBuffer(buffer);
    if (fileType?.mime) {
        return { buffer, mimeType: fileType.mime };
    }

    const head = buffer.slice(0, 256).toString("utf8").trimStart();
    if (head.startsWith("<svg") || head.startsWith("<?xml")) {
        return { buffer, mimeType: "image/svg+xml" };
    }

    return { buffer, mimeType: "image/jpeg" };
}
