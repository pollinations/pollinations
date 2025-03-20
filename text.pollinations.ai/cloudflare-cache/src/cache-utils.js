/**
 * Utility functions for caching text responses in Cloudflare R2
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

/**
 * Generate a consistent cache key from URL and request body
 * @param {URL} url - The URL object
 * @param {Object} requestBody - The request body (for POST requests)
 * @returns {string} - The cache key
 */
export function generateCacheKey(url, requestBody = null) {
  // Normalize the URL by sorting query parameters
  const normalizedUrl = new URL(url);
  const params = Array.from(normalizedUrl.searchParams.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  
  // Clear and re-add sorted parameters
  normalizedUrl.search = '';
  params.forEach(([key, value]) => {
    // Skip certain parameters that shouldn't affect caching
    if (!['nofeed', 'no-cache', 'stream'].includes(key)) {
      normalizedUrl.searchParams.append(key, value);
    }
  });
  
  // Get the full path with query parameters
  const fullPath = normalizedUrl.pathname + normalizedUrl.search;
  
  // For POST requests, include relevant parts of the request body in the cache key
  let bodyHash = '';
  if (requestBody) {
    try {
      // Extract only the parts of the request body that affect the response
      const relevantBodyParts = {
        messages: requestBody.messages,
        model: requestBody.model,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        top_p: requestBody.top_p,
        frequency_penalty: requestBody.frequency_penalty,
        presence_penalty: requestBody.presence_penalty,
      };
      
      // Create a hash of the relevant body parts
      bodyHash = '-' + createHash(JSON.stringify(relevantBodyParts));
    } catch (error) {
      console.error('Error creating body hash:', error);
    }
  }
  
  // Create a hash of the full URL for uniqueness
  const urlHash = createHash(fullPath);
  
  // Replace problematic characters in the path
  const safePath = fullPath.replace(/[\/\s\?=&]/g, '_');
  
  // Combine path with hash, ensuring it fits within a safe limit (1000 bytes)
  // Allow 20 chars for the hash and hyphen
  const maxPathLength = 980;
  const trimmedPath = safePath.length > maxPathLength 
    ? safePath.substring(0, maxPathLength) 
    : safePath;
    
  return `${trimmedPath}-${urlHash}${bodyHash}`;
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
    // Store the text response in R2 using the cache key directly
    const responseBuffer = await response.arrayBuffer();
    
    // Get client information from request
    const clientIp = request?.headers?.get('cf-connecting-ip') || 
                   request?.headers?.get('x-forwarded-for')?.split(',')[0] || 
                   'unknown';
    
    // Get additional client information
    const userAgent = request?.headers?.get('user-agent') || '';
    const referer = request?.headers?.get('referer') || request?.headers?.get('referrer') ||'';
    const acceptLanguage = request?.headers?.get('accept-language') || '';
    
    // Get request-specific information
    const method = request?.method || 'GET';
    const requestTime = new Date().toISOString();
    const requestId = request?.headers?.get('cf-ray') || '';  // Cloudflare Ray ID uniquely identifies the request
    
    // Helper function to sanitize and limit string length
    const sanitizeValue = (value, maxLength = 256, key = null) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'string') return value.substring(0, maxLength);
      if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item, maxLength));
      }
      if (typeof value === 'object') {
        // Special case for detectionIds - stringify it
        if (key === 'detectionIds') {
          try {
            return JSON.stringify(value);
          } catch (e) {
            return undefined;
          }
        }
        // Skip other objects
        return undefined;
      }
      return value;
    };
    
    // Filter CF data to exclude object values
    const filterCfData = (cf) => {
      if (!cf) return {};
      
      const filtered = {};
      for (const [key, value] of Object.entries(cf)) {
        // Skip botManagement as we'll handle it separately
        if (key === 'botManagement') continue;
        
        // Only include non-object values or special cases
        if (typeof value !== 'object' || value === null) {
          filtered[key] = sanitizeValue(value, 256, key);
        } else if (key === 'detectionIds') {
          // Special case for detectionIds
          try {
            filtered[key] = JSON.stringify(value);
          } catch (e) {
            // Skip if can't stringify
          }
        }
      }
      return filtered;
    };
    
    // Filter botManagement to exclude object values
    const filterBotManagement = (botManagement) => {
      if (!botManagement) return {};
      
      const filtered = {};
      for (const [key, value] of Object.entries(botManagement)) {
        // Only include non-object values except for detectionIds
        if (typeof value !== 'object' || value === null) {
          filtered[key] = sanitizeValue(value, 256, key);
        } else if (key === 'detectionIds') {
          // Special case for detectionIds
          try {
            filtered[key] = JSON.stringify(value);
          } catch (e) {
            // Skip if can't stringify
          }
        }
      }
      return filtered;
    };
    
    // Create metadata object with content type and original URL
    const metadata = {
      httpMetadata: {
        contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
        contentEncoding: response.headers.get('content-encoding'),
        contentDisposition: response.headers.get('content-disposition'),
        contentLanguage: response.headers.get('content-language'),
        cacheControl: response.headers.get('cache-control'),
        // Store if this is a streaming response
        isStreaming: response.headers.get('content-type')?.includes('text/event-stream') ? 'true' : 'false'
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
        
        // Cloudflare information - spread filtered cf data
        ...filterCfData(request?.cf),
        
        // Bot Management information if available
        ...filterBotManagement(request?.cf?.botManagement)
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
    await env.TEXT_BUCKET.put(cacheKey, responseBuffer, metadata);
    
    console.log(`Cached text response for key ${cacheKey}`);
    return true;
  } catch (error) {
    console.error('Error caching response:', error);
    return false;
  }
}