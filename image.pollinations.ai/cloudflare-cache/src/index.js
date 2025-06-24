import { generateCacheKey, cacheResponse } from './cache-utils.js';
import { proxyToOrigin } from './image-proxy.js';
import { sendToAnalytics } from './analytics.js';
import { createSemanticCache, checkSemanticCacheAndRespond, cacheImageEmbedding, checkExactCacheAndRespond } from './semantic-cache.js';
import { extractPromptFromUrl, extractImageParams } from './hybrid-cache.js';

import { getClientIp } from './ip-utils.js';

// Cache status constants for better readability
const CACHE_STATUS = {
  PENDING: 'pending',
  HIT: 'hit',
  MISS: 'miss'
};

// Event name constants for consistency
const EVENTS = {
  REQUEST: 'imageRequested',       // Start of the request
  SERVED_FROM_CACHE: 'imageServedFromCache', // Cache hit
  GENERATED: 'imageGenerated',     // Cache miss with successful generation
  FAILED: 'imageGenerationFailed' // Error during generation
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
  // Simple logging
  console.log(`[ANALYTICS] Sending event ${eventName} with cacheStatus=${cacheStatus}`);
  
  // Create a single params object with all necessary data
  // The refactored analytics.js will handle parameter processing
  const analyticsData = {
    ...params,
    cacheStatus
  };
  
  // Send the analytics - let the analytics.js module handle the parameter processing
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
    
    // Create semantic cache instance
    const semanticCache = createSemanticCache(env);
    
    // Extract the prompt for analytics and semantic caching using consistent decoding
    const semanticPrompt = extractPromptFromUrl(url);
    const originalPrompt = semanticPrompt || ''; // Use same prompt for analytics consistency
    const imageParams = extractImageParams(url);

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
    const exactCacheResponse = await checkExactCacheAndRespond(env.IMAGE_BUCKET, cacheKey);
    
    if (exactCacheResponse) {
      console.log(`Cache hit for: ${cacheKey}`);
      
      // Send analytics for cache hit
      if (url.pathname.startsWith('/prompt/')) {
        sendImageAnalytics(request, EVENTS.SERVED_FROM_CACHE, CACHE_STATUS.HIT, analyticsParams, env, ctx);
      }
      
      return exactCacheResponse;
    }
    
    // Check semantic cache for similar images (after exact cache miss)
    console.log('[DEBUG] Starting semantic cache check...');
    let semanticDebugInfo = null;
    try {
      const semanticResult = await checkSemanticCacheAndRespond(semanticCache, semanticPrompt, imageParams);
      semanticDebugInfo = semanticResult?.debugInfo;
      
      if (semanticResult?.response) {
        console.log('Semantic cache hit - returning similar image');
        
        // Send analytics for semantic cache hit
        if (url.pathname.startsWith('/prompt/')) {
          const similarity = semanticResult.response.headers.get('x-semantic-similarity');
          sendImageAnalytics(request, EVENTS.SERVED_FROM_CACHE, CACHE_STATUS.HIT, {
            ...analyticsParams,
            cacheType: 'semantic',
            similarity: similarity
          }, env, ctx);
        }
        
        return semanticResult.response;
      }
      console.log('[DEBUG] No semantic cache hit, proceeding to origin');
    } catch (error) {
      console.error('Error checking semantic cache:', error);
      // Continue to origin - semantic cache errors shouldn't break requests
    }

    // Cache miss - proxy to origin
    console.log('Proxying request to origin service...');
    const response = await proxyToOrigin(request, env);
    
    // Only cache successful image responses
    if (response.status === 200 && response.headers.get('content-type')?.includes('image/')) {
      console.log('Caching successful image response');
      // Pass the original URL and request to the cacheResponse function
      ctx.waitUntil(cacheResponse(cacheKey, response.clone(), env, url.toString(), request));
      
      // Store embedding asynchronously for semantic caching
      ctx.waitUntil(cacheImageEmbedding(semanticCache, cacheKey, semanticPrompt, imageParams));
      
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
    
    // Add semantic debug headers if we performed a semantic search
    if (semanticDebugInfo?.searchPerformed) {
      if (semanticDebugInfo.bestSimilarity !== null) {
        newHeaders.set('x-semantic-best-similarity', semanticDebugInfo.bestSimilarity.toFixed(3));
        newHeaders.set('x-semantic-threshold', semanticCache.similarityThreshold.toString()); // Show current threshold
      }
      newHeaders.set('x-semantic-search', 'performed');
    } else {
      newHeaders.set('x-semantic-search', 'skipped');
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
};
