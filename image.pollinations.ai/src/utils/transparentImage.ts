import sharp from "sharp";

// Configuration constants
const TRANSPARENT_IMAGE_CONFIG = {
    QUALITY: 10,
    EFFORT: 0,
    FORMAT: 'webp' as const,
    CHANNELS: 4, // RGBA
    BACKGROUND: { r: 0, g: 0, b: 0, alpha: 0 } // Fully transparent
};

// Simple in-memory cache for generated transparent images
const transparentImageCache = new Map<string, {base64: string, mimeType: string}>();

/**
 * Generates a transparent WebP image buffer for the exact requested dimensions.
 * Uses memoization to cache results for repeated requests.
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

    // Create cache key for memoization
    const cacheKey = `${width}x${height}`;
    
    // Check if we already have this image cached
    const cached = transparentImageCache.get(cacheKey);
    if (cached) {
        console.log(`Using cached transparent WebP: ${cacheKey} → ${cached.base64.length} chars`);
        return cached;
    }

    try {
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
        
        const result = {
            base64: base64,
            mimeType: `image/${TRANSPARENT_IMAGE_CONFIG.FORMAT}`
        };
        
        // Cache the result for future requests
        transparentImageCache.set(cacheKey, result);
        
        console.log(`Generated transparent WebP: ${cacheKey} → ${base64.length} chars (${transparentBuffer.length}B) [cached]`);
        
        return result;
    } catch (error) {
        throw new Error(
            `Failed to generate transparent image for ${width}x${height}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}
