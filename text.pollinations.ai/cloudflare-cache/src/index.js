import { generateCacheKey, cacheResponse } from './cache-utils.js';
import { proxyToOrigin } from './text-proxy.js';

/**
 * Cloudflare Worker for caching Pollinations text responses in R2
 * This worker acts as a thin proxy that:
 * 1. Checks if a text response is cached in R2
 * 2. Serves the cached response if available
 * 3. Proxies to the original service if not cached
 * 4. Caches the response for future requests
 */
export default {
  async fetch(request, env, ctx) {
    // Get basic request details
    const url = new URL(request.url);
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    const method = request.method;
    
    console.log(`Request: ${method} ${url.pathname}`);
    
    // Skip caching when no-cache is specified
    if (url.searchParams.has('no-cache')) {
      console.log('Skipping cache for non-cacheable request');
      return await proxyToOrigin(request, env);
    }
    
    // Check if this is a streaming request
    const isStreamingRequest = url.searchParams.has('stream');
    
    // For POST requests, we need to read the body to generate the cache key
    let requestBody = null;
    let requestClone = request.clone();
    
    if (method === 'POST') {
      try {
        requestBody = await request.clone().json();
        console.log('Request body parsed for cache key generation');
      } catch (error) {
        console.error('Error parsing request body:', error);
        // If we can't parse the body, we can't generate a proper cache key
        // So we'll just proxy the request to the origin
        return await proxyToOrigin(requestClone, env);
      }
    }
    
    // Generate a cache key from the URL path, query parameters, and request body
    const cacheKey = generateCacheKey(url, requestBody);
    console.log('Cache key:', cacheKey);
    
    // Check if we have this response cached in R2
    try {
      const cachedResponse = await env.TEXT_BUCKET.get(cacheKey);
      
      if (cachedResponse) {
        console.log(`Cache hit for: ${cacheKey}`);
        // Return the cached response with appropriate headers
        const cachedHeaders = new Headers();
        
        // Use the stored HTTP metadata if available
        if (cachedResponse.httpMetadata) {
          if (cachedResponse.httpMetadata.contentType) {
            cachedHeaders.set('content-type', cachedResponse.httpMetadata.contentType);
          }
          if (cachedResponse.httpMetadata.contentEncoding) {
            cachedHeaders.set('content-encoding', cachedResponse.httpMetadata.contentEncoding);
          }
          if (cachedResponse.httpMetadata.contentDisposition) {
            cachedHeaders.set('content-disposition', cachedResponse.httpMetadata.contentDisposition);
          }
          if (cachedResponse.httpMetadata.contentLanguage) {
            cachedHeaders.set('content-language', cachedResponse.httpMetadata.contentLanguage);
          }
        } else {
          // Fallback to default content type
          cachedHeaders.set('content-type', 'application/json; charset=utf-8');
        }

        // For streaming requests, set the appropriate content type
        if (isStreamingRequest) {
          cachedHeaders.set('content-type', 'text/event-stream; charset=utf-8');
        }
        
        // Always set these headers for cache control and CORS
        cachedHeaders.set('cache-control', 'public, max-age=31536000, immutable');
        cachedHeaders.set('x-cache', 'HIT');
        cachedHeaders.set('access-control-allow-origin', '*');
        cachedHeaders.set('access-control-allow-methods', 'GET, POST, OPTIONS');
        cachedHeaders.set('access-control-allow-headers', 'Content-Type');
        
        return new Response(cachedResponse.body, {
          headers: cachedHeaders
        });
      }
    } catch (error) {
      console.error('Error retrieving cached response:', error);
    }
    
    console.log(`Cache miss for: ${cacheKey}`);
    
    // Cache miss - proxy to origin
    console.log('Proxying request to origin service...');
    const response = await proxyToOrigin(requestClone, env);
    
    // Only cache successful responses (including streaming responses)
    if (response.status === 200) {
      // Check content type to determine if it's a text, JSON, or streaming response
      const contentType = response.headers.get('content-type') || '';
      const isTextResponse = contentType.includes('text/') || 
                            contentType.includes('application/json') || 
                            contentType.includes('application/javascript');
      
      // Check if this is a streaming response
      const isStreamingResponse = contentType.includes('text/event-stream');
      
      // Cache both regular text responses and streaming responses
      if (isTextResponse || isStreamingResponse) {
        console.log('Caching successful text response');
        // Pass the original URL and request to the cacheResponse function
        ctx.waitUntil(cacheResponse(cacheKey, response.clone(), env, url.toString(), request));
      } else {
        console.log('Not caching non-text response with content-type:', contentType);
      }
    } else {
      console.log('Not caching unsuccessful response with status:', response.status);
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