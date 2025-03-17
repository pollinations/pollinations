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
  
  // Get the full path with query parameters
  const fullPath = normalizedUrl.pathname + normalizedUrl.search;
  
  // Create a hash of the full URL for uniqueness
  const hash = createHash(fullPath);
  
  // Replace problematic characters in the path
  const safePath = fullPath.replace(/[\/\s\?=&]/g, '_');
  
  // Combine path with hash, ensuring it fits within a safe limit (1000 bytes)
  // Allow 10 chars for the hash and hyphen
  const maxPathLength = 990;
  const trimmedPath = safePath.length > maxPathLength 
    ? safePath.substring(0, maxPathLength) 
    : safePath;
    
  return `${trimmedPath}-${hash}`;
}

/**
 * Create a simple hash of a string
 * @param {string} str - The string to hash
 * @returns {string} - The hashed string
 */
function createHash(str) {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to hex string (8 characters should be sufficient)
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Store a response in R2
 * @param {string} cacheKey - The cache key
 * @param {Response} response - The response to cache
 * @param {Object} env - The environment object
 * @param {string} originalUrl - The original URL that was requested
 * @param {Request} request - The original request object
 * @returns {Promise<boolean>} - Whether the caching was successful
 */
export async function cacheResponse(cacheKey, response, env, originalUrl, request) {
  try {
    // Store the image in R2 using the cache key directly
    const imageBuffer = await response.arrayBuffer();
    
    // Get client information from request
    const clientIp = request?.headers?.get('cf-connecting-ip') || 
                    request?.headers?.get('x-forwarded-for')?.split(',')[0] || 
                    'unknown';
    
    // Get additional client information
    const userAgent = request?.headers?.get('user-agent') || '';
    const referer = request?.headers?.get('referer') || '';
    const acceptLanguage = request?.headers?.get('accept-language') || '';
    
    // Get request-specific information
    const method = request?.method || 'GET';
    const requestTime = new Date().toISOString();
    const requestId = request?.headers?.get('cf-ray') || '';  // Cloudflare Ray ID uniquely identifies the request
    
    // Get Cloudflare-specific information if available
    const country = request?.cf?.country || '';
    const city = request?.cf?.city || '';
    const continent = request?.cf?.continent || '';
    const timezone = request?.cf?.timezone || '';
    const postalCode = request?.cf?.postalCode || '';
    const region = request?.cf?.region || '';
    const regionCode = request?.cf?.regionCode || '';
    const colo = request?.cf?.colo || '';  // Cloudflare data center that handled the request
    const asn = request?.cf?.asn || '';    // Autonomous System Number (network provider)
    const tlsVersion = request?.cf?.tlsVersion || '';  // TLS version used for the connection
    const tlsCipher = request?.cf?.tlsCipher || '';    // TLS cipher used for the connection
    const httpProtocol = request?.cf?.httpProtocol || '';  // HTTP protocol version (HTTP/1.1, HTTP/2, etc.)
    
    // Create metadata object with content type and original URL
    const metadata = {
      httpMetadata: {
        contentType: response.headers.get('content-type') || 'image/jpeg',
        contentEncoding: response.headers.get('content-encoding'),
        contentDisposition: response.headers.get('content-disposition'),
        contentLanguage: response.headers.get('content-language'),
        cacheControl: response.headers.get('cache-control')
      },
      customMetadata: {
        // Essential metadata
        originalUrl: originalUrl || '',
        cachedAt: new Date().toISOString(),
        clientIp: clientIp,
        
        // Client information (with length limits)
        userAgent: userAgent.substring(0, 256), 
        referer: referer.substring(0, 256),
        acceptLanguage: acceptLanguage.substring(0, 64),
        
        // Request-specific information
        method,
        requestTime,
        requestId,
        
        // Cloudflare-specific information
        country,
        city,
        continent,
        timezone,
        postalCode,
        region,
        regionCode,
        colo,
        asn,
        tlsVersion,
        tlsCipher,
        httpProtocol
      }
    };
    
    // Remove undefined values from httpMetadata
    Object.keys(metadata.httpMetadata).forEach(key => {
      if (metadata.httpMetadata[key] === undefined || metadata.httpMetadata[key] === null) {
        delete metadata.httpMetadata[key];
      }
    });
    
    // Remove empty values from customMetadata to save space
    Object.keys(metadata.customMetadata).forEach(key => {
      if (!metadata.customMetadata[key]) {
        delete metadata.customMetadata[key];
      }
    });
    
    // Store the object with metadata
    await env.IMAGE_BUCKET.put(cacheKey, imageBuffer, metadata);
    
    console.log(`Cached image for key ${cacheKey}`);
    return true;
  } catch (error) {
    console.error('Error caching response:', error);
    return false;
  }
}
