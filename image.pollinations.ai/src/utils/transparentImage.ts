import sharp from "sharp";

/**
 * Generates a transparent WebP image buffer for the exact requested dimensions.
 * 
 * Returns base64 data that can be used directly with Vertex AI's inlineData format.
 * Much more efficient than creating data URLs or external uploads.
 *
 * @param {number} width - The exact width in pixels.
 * @param {number} height - The exact height in pixels.
 * @returns {Promise<{base64: string, mimeType: string}>} Image data for Vertex AI
 *
 * @example
 * ```typescript
 * const {base64, mimeType} = await generateTransparentImage(1920, 1080);
 * // Use base64 directly with Vertex AI inlineData
 * ```
 */
export async function generateTransparentImage(
    width: number,
    height: number,
): Promise<{base64: string, mimeType: string}> {
    // Validate input parameters
    if (!Number.isInteger(width) || width <= 0) {
        throw new Error(`Invalid width: ${width}. Width must be a positive integer.`);
    }

    if (!Number.isInteger(height) || height <= 0) {
        throw new Error(`Invalid height: ${height}. Height must be a positive integer.`);
    }

    try {
        // Create a transparent WebP at the exact requested dimensions
        const transparentBuffer = await sharp({
            create: {
                width: width,
                height: height,
                channels: 4, // RGBA
                background: { r: 0, g: 0, b: 0, alpha: 0 }, // Fully transparent
            },
        })
        .webp({ quality: 10, effort: 0 }) // Low quality, fast compression for transparent image
        .toBuffer();

        // Convert to base64 for Vertex AI inlineData
        const base64 = transparentBuffer.toString('base64');
        
        console.log(`Generated transparent WebP: ${width}x${height} → ${base64.length} chars (${transparentBuffer.length}B)`);
        
        return {
            base64: base64,
            mimeType: 'image/webp'
        };
    } catch (error) {
        throw new Error(
            `Failed to generate transparent image for ${width}x${height}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}
