import { generateCacheKey, cacheResponse } from './cache-utils.js';
import { proxyToOrigin } from './image-proxy.js';

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
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    
    console.log(`Request: ${request.method} ${url.pathname}`);
    
    // Skip caching for certain paths or non-image requests
    if (url.searchParams.has('no-cache') || !url.pathname.startsWith('/prompt')) {
      console.log('Skipping cache for non-cacheable request');
      return await proxyToOrigin(request, env);
    }
    
    // Generate a cache key from the URL path and query parameters
    const cacheKey = generateCacheKey(url);
    console.log('Cache key:', cacheKey);
    
    // Check if we have this image cached in R2
    try {
      const cachedImage = await env.IMAGE_BUCKET.get(cacheKey);
      
      if (cachedImage) {
        console.log(`Cache hit for: ${cacheKey}`);
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
    } else {
      console.log('Not caching response - either not successful or not an image');
      console.log('Response status:', response.status);
      console.log('Content-Type:', response.headers.get('content-type'));
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
