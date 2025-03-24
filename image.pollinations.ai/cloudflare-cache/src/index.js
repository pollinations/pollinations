import { generateCacheKey, cacheResponse } from './cache-utils.js';
import { proxyToOrigin } from './image-proxy.js';
import { sendToAnalytics } from './analytics.js';
import { getClientIp } from './ip-utils.js';

// Cache status constants for better readability
const CACHE_STATUS = {
  PENDING: 'pending',
  HIT: 'hit',
  MISS: 'miss'
};

// Event name constants for consistency
const EVENTS = {
  REQUEST: 'image_requested',       // Start of the request
  SERVED_FROM_CACHE: 'image_served_from_cache', // Cache hit
  GENERATED: 'image_generated',     // Cache miss with successful generation
  FAILED: 'image_generation_failed' // Error during generation
};

/**
 * Helper function to send analytics with cleaner syntax
 * @param {Request} request - The original request
 * @param {string} eventName - The event name from EVENTS constants
 * @param {string} cacheStatus - The cache status from CACHE_STATUS constants
 * @param {Object} params - Additional analytics parameters
 * @param {Object} env - Environment variables
 * @param {ExecutionContext} ctx - The execution context
 */
function sendImageAnalytics(request, eventName, cacheStatus, params, env, ctx) {
  // Enhanced logging for cache status debugging
  console.log(`[ANALYTICS DEBUG] Sending event ${eventName} with cacheStatus=${cacheStatus}`);
  
  // Create shallow copies to avoid modifying originals
  const analyticsSafeParams = { ...params.safeParams };
  analyticsSafeParams.cacheStatus = cacheStatus;
  
  // Add error if provided
  if (params.error) {
    analyticsSafeParams.error = params.error;
  }
  
  const analyticsData = {
    originalPrompt: params.originalPrompt,
    safeParams: analyticsSafeParams,
    referrer: params.referrer,
    // Add cacheStatus at the top level to ensure it's accessible
    cacheStatus: cacheStatus
  };
  
  // Log the full analytics data
  console.log(`[ANALYTICS DEBUG] Full analytics data:`, JSON.stringify(analyticsData, null, 2));
  
  // Send the analytics
  ctx.waitUntil(sendToAnalytics(request, eventName, analyticsData, env));
}

/**
 * Cloudflare Worker for caching Pollinations images in R2
 * This worker acts as a thin proxy that:
 * 1. Checks if an image is cached in R2
 * 2. Serves the cached image if available
 * 3. Proxies to the original service if not cached
 * 4. Caches the response for future requests
 */
export default {
  async fetch(request, env, ctx) {
    // Get basic request details
    const url = new URL(request.url);
    const clientIP = getClientIp(request);
    
    console.log(`Request: ${request.method} ${url.pathname}`);
    
    // Extract the prompt for analytics
    const originalPrompt = url.pathname.startsWith('/prompt/')
      ? decodeURIComponent(url.pathname.split('/prompt/')[1])
      : '';
    
    // Process query parameters for analytics
    const safeParams = {};
    for (const [key, value] of url.searchParams.entries()) {
      safeParams[key] = value;
    }
    
    // Get referrer for analytics
    const referrer = request.headers.get('referer') || 
                    request.headers.get('referrer') || 
                    '';
    
    // Common analytics parameters
    const analyticsParams = {
      originalPrompt,
      safeParams,
      referrer
    };
    
    // Skip caching for certain paths or non-image requests
    if (url.searchParams.has('no-cache') || !url.pathname.startsWith('/prompt')) {
      console.log('Skipping cache for non-cacheable request');
      return await proxyToOrigin(request, env);
    }
    
    // Send image requested analytics event
    if (url.pathname.startsWith('/prompt/')) {
      sendImageAnalytics(request, EVENTS.REQUEST, CACHE_STATUS.PENDING, analyticsParams, env, ctx);
    }
    
    // Generate a cache key from the URL path and query parameters
    const cacheKey = generateCacheKey(url);
    console.log('Cache key:', cacheKey);
    
    // Check if we have this image cached in R2
    try {
      const cachedImage = await env.IMAGE_BUCKET.get(cacheKey);
      
      if (cachedImage) {
        console.log(`Cache hit for: ${cacheKey}`);
        
        // Send analytics for cache hit
        if (url.pathname.startsWith('/prompt/')) {
          sendImageAnalytics(request, EVENTS.SERVED_FROM_CACHE, CACHE_STATUS.HIT, analyticsParams, env, ctx);
        }
        
        // Return the cached image with appropriate headers
        const cachedHeaders = new Headers();
        
        // Use the stored HTTP metadata if available
        if (cachedImage.httpMetadata) {
          if (cachedImage.httpMetadata.contentType) {
            cachedHeaders.set('content-type', cachedImage.httpMetadata.contentType);
          }
          if (cachedImage.httpMetadata.contentEncoding) {
            cachedHeaders.set('content-encoding', cachedImage.httpMetadata.contentEncoding);
          }
          if (cachedImage.httpMetadata.contentDisposition) {
            cachedHeaders.set('content-disposition', cachedImage.httpMetadata.contentDisposition);
          }
          if (cachedImage.httpMetadata.contentLanguage) {
            cachedHeaders.set('content-language', cachedImage.httpMetadata.contentLanguage);
          }
        } else {
          // Fallback to default content type
          cachedHeaders.set('content-type', 'image/jpeg');
        }
        
        // Always set these headers for cache control and CORS
        cachedHeaders.set('cache-control', 'public, max-age=31536000, immutable');
        cachedHeaders.set('x-cache', 'HIT');
        cachedHeaders.set('access-control-allow-origin', '*');
        cachedHeaders.set('access-control-allow-methods', 'GET, POST, OPTIONS');
        cachedHeaders.set('access-control-allow-headers', 'Content-Type');
        
        return new Response(cachedImage.body, {
          headers: cachedHeaders
        });
      }
    } catch (error) {
      console.error('Error retrieving cached image:', error);
    }
    
    console.log(`Cache miss for: ${cacheKey}`);
    
    // Cache miss - proxy to origin
    console.log('Proxying request to origin service...');
    const response = await proxyToOrigin(request, env);
    
    // Only cache successful image responses
    if (response.status === 200 && response.headers.get('content-type')?.includes('image/')) {
      console.log('Caching successful image response');
      // Pass the original URL and request to the cacheResponse function
      ctx.waitUntil(cacheResponse(cacheKey, response.clone(), env, url.toString(), request));
      
      // Send analytics for cache miss but successful generation
      if (url.pathname.startsWith('/prompt/')) {
        sendImageAnalytics(request, EVENTS.GENERATED, CACHE_STATUS.MISS, analyticsParams, env, ctx);
      }
    } else {
      console.log('Not caching response - either not successful or not an image');
      console.log('Response status:', response.status);
      console.log('Content-Type:', response.headers.get('content-type'));
      
      // Send analytics for failed request
      if (url.pathname.startsWith('/prompt/') && response.status !== 200) {
        const errorParams = {
          ...analyticsParams,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
        sendImageAnalytics(request, EVENTS.FAILED, CACHE_STATUS.MISS, errorParams, env, ctx);
      }
    }
    
    // Add cache miss header to the response
    const newHeaders = new Headers(response.headers);
    newHeaders.set('x-cache', 'MISS');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
