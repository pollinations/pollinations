import sharp from "sharp";

/**
 * Generates a fully transparent PNG image of the specified dimensions.
 *
 * @param {number} width - The width of the image in pixels (must be positive).
 * @param {number} height - The height of the image in pixels (must be positive).
 * @returns {Promise<Buffer>} A Promise that resolves to a Buffer containing the transparent PNG image data.
 * @throws {Error} If width or height are not positive numbers, or if image generation fails.
 *
 * @example
 * ```typescript
 * const buffer = await generateTransparentImage(1920, 1080);
 * console.log(`Generated transparent image: ${buffer.length} bytes`);
 * ```
 */
export async function generateTransparentImage(
    width: number,
    height: number,
): Promise<Buffer> {
    // Validate input parameters
    if (!Number.isInteger(width) || width <= 0) {
        throw new Error(`Invalid width: ${width}. Width must be a positive integer.`);
    }

    if (!Number.isInteger(height) || height <= 0) {
        throw new Error(`Invalid height: ${height}. Height must be a positive integer.`);
    }

    try {
        // Create a transparent PNG using Sharp
        // We create a buffer with RGBA format where all pixels are transparent (alpha = 0)
        const transparentBuffer = await sharp({
            create: {
                width: width,
                height: height,
                channels: 4, // RGBA
                background: { r: 0, g: 0, b: 0, alpha: 0 }, // Fully transparent
            },
        })
        .png() // Output as PNG format
        .toBuffer();

        return transparentBuffer;
    } catch (error) {
        throw new Error(
            `Failed to generate transparent image of size ${width}x${height}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}