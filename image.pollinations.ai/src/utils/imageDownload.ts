import { fileTypeFromBuffer } from "file-type";

/**
 * Download image from URL and convert to base64 with correct MIME type detection
 * Uses magic bytes instead of trusting content-type header (fixes Telegram CDN issues)
 */
export async function downloadImageAsBase64(
    imageUrl: string,
): Promise<{ base64: string; mimeType: string }> {
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
        throw new Error(
            `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
        );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const bufferNode = Buffer.from(imageBuffer);
    const base64 = bufferNode.toString("base64");

    // Detect MIME type from magic bytes (don't trust content-type header)
    // Some CDNs like Telegram return application/octet-stream for images
    const fileType = await fileTypeFromBuffer(bufferNode);
    const mimeType = fileType?.mime || "image/jpeg";

    return { base64, mimeType };
}
