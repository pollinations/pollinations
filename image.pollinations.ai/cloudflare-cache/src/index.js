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
    // Immediately log request details
    const url = new URL(request.url);
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] Request received: ${request.method} ${url.pathname}${url.search}`);
    console.log(`Client IP: ${clientIP}`);
    console.log(`Path: ${url.pathname}`);
    console.log(`Query parameters: ${url.search}`);
    console.log(`User-Agent: ${request.headers.get('user-agent')}`);
    
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
        cachedHeaders.set('content-type', cachedImage.httpMetadata?.contentType || 'image/jpeg');
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
      ctx.waitUntil(cacheResponse(cacheKey, response.clone(), env));
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
