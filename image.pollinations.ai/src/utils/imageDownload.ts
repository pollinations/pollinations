/**
 * Detect MIME type from magic bytes in the buffer header.
 * Matches the approach used in index.ts for format detection.
 */
function detectMimeType(buffer: Uint8Array): string {
    // PNG: 89 50 4E 47
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    )
        return "image/png";
    // WebP: RIFF....WEBP
    if (
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    )
        return "image/webp";
    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)
        return "image/gif";
    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
    // Default to JPEG
    return "image/jpeg";
}

/**
 * Download image from URL and convert to base64 with correct MIME type detection
 * Uses magic bytes instead of trusting content-type header (fixes Telegram CDN issues)
 */
export async function downloadImageAsBase64(
    imageUrl: string,
    signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
    const imageResponse = await fetch(imageUrl, { signal });

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
    const mimeType = detectMimeType(new Uint8Array(imageBuffer));

    return { base64, mimeType };
}
