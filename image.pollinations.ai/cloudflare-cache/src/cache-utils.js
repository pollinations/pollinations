/**
 * Utility functions for caching images in Cloudflare R2
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

/**
 * Generate a consistent cache key from URL
 * @param {URL} url - The URL object
 * @returns {string} - The cache key
 */
export function generateCacheKey(url) {
  // Normalize the URL by sorting query parameters
  const normalizedUrl = new URL(url);
  const params = Array.from(normalizedUrl.searchParams.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  
  // Clear and re-add sorted parameters
  normalizedUrl.search = '';
  params.forEach(([key, value]) => {
    // Skip certain parameters that shouldn't affect caching
    if (!['nofeed', 'no-cache'].includes(key)) {
      normalizedUrl.searchParams.append(key, value);
    }
  });
  
  // Create a safe key by encoding the URL and ensuring the prompt is included
  return encodeURIComponent(normalizedUrl.pathname + normalizedUrl.search);
}

/**
 * Store a response in R2
 * @param {string} cacheKey - The cache key
 * @param {Response} response - The response to cache
 * @param {Object} env - The environment object
 * @returns {Promise<boolean>} - Whether the caching was successful
 */
export async function cacheResponse(cacheKey, response, env) {
  try {
    // Store the image in R2 using the cache key directly
    const imageBuffer = await response.arrayBuffer();
    await env.IMAGE_BUCKET.put(cacheKey, imageBuffer, {
      httpMetadata: {
        contentType: response.headers.get('content-type') || 'image/jpeg',
      }
    });
    
    console.log(`Cached image for key ${cacheKey}`);
    return true;
  } catch (error) {
    console.error('Error caching response:', error);
    return false;
  }
}
