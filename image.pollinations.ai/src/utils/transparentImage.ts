import sharp from "sharp";
import memoize from "lodash.memoize";

// Configuration constants
const TRANSPARENT_IMAGE_CONFIG = {
    QUALITY: 10,
    EFFORT: 0,
    FORMAT: 'webp' as const,
    CHANNELS: 4, // RGBA
    BACKGROUND: { r: 0, g: 0, b: 0, alpha: 0 } // Fully transparent
};

/**
 * Generates a transparent WebP image buffer for the exact requested dimensions.
 * Uses lodash.memoize to cache results for repeated requests.
 * 
 * Returns base64 data that can be used directly with Vertex AI's inlineData format.
 * Much more efficient than creating data URLs or external uploads.
 *
 * @param {number} width - The exact width in pixels.
 * @param {number} height - The exact height in pixels.
 * @returns {Promise<{base64: string, mimeType: string}>} Image data for Vertex AI
 */
async function _generateTransparentImage(
    width: number,
    height: number,
): Promise<{base64: string, mimeType: string}> {
    // Create a transparent WebP at the exact requested dimensions
    const transparentBuffer = await sharp({
        create: {
            width: width,
            height: height,
            channels: TRANSPARENT_IMAGE_CONFIG.CHANNELS,
            background: TRANSPARENT_IMAGE_CONFIG.BACKGROUND,
        },
    } as any)
    .webp({ 
        quality: TRANSPARENT_IMAGE_CONFIG.QUALITY, 
        effort: TRANSPARENT_IMAGE_CONFIG.EFFORT 
    })
    .toBuffer();

    // Convert to base64 for Vertex AI inlineData
    const base64 = transparentBuffer.toString('base64');
    
    console.log(`Generated transparent WebP: ${width}x${height} → ${base64.length} chars (${transparentBuffer.length}B) [memoized]`);
    
    return {
        base64: base64,
        mimeType: `image/${TRANSPARENT_IMAGE_CONFIG.FORMAT}`
    };
}

// Memoized version - this is the exported function
export const generateTransparentImage = memoize(
    _generateTransparentImage,
    (width: number, height: number) => `${width}x${height}`
);
