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

/**
 * Determines if a request should be cached based on path and query parameters
 * @param {URL} url - The request URL
 * @returns {boolean} - Whether the request is cacheable
 */
function isCacheable(url) {
  const nonCacheablePaths = ['/models', '/feed', '/openai/models'];
  return !url.searchParams.has('no-cache') && !nonCacheablePaths.includes(url.pathname);
}

/**
 * Determines if a request is a streaming request
 * @param {URL} url - The request URL
 * @param {Object|null} requestBody - The parsed request body (for POST requests)
 * @returns {boolean} - Whether the request is a streaming request
 */
function isStreamingRequest(url, requestBody = null) {
  // Check URL parameter first
  if (url.searchParams.has('stream')) {
    return true;
  }

  // Then check request body if available
  if (requestBody && requestBody.stream === true) {
    console.log('Streaming request detected from request body');
    return true;
  }

  return false;
}

/**
 * Parses the request body for POST requests
 * @param {Request} request - The original request
 * @returns {Object} - The parsed body and a clone of the request
 */
async function parseRequestBody(request) {
  const requestClone = request.clone();
  let requestBody = null;

  if (request.method === 'POST') {
    try {
      requestBody = await request.clone().json();
      console.log('Request body parsed for cache key generation');
    } catch (error) {
      console.error('Error parsing request body:', error);
      // Return null to indicate parsing failed
      return { requestBody: null, requestClone };
    }
  }

  return { requestBody, requestClone };
}

/**
 * Retrieves a cached response from R2 storage
 * @param {Object} env - The environment object
 * @param {string} cacheKey - The cache key
 * @returns {Object|null} - The cached response or null if not found
 */
async function getCachedResponse(env, cacheKey) {
  try {
    const cachedResponse = await env.TEXT_BUCKET.get(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for: ${cacheKey}`);
      return cachedResponse;
    }
  } catch (error) {
    console.error('Error retrieving cached response:', error);
  }

  console.log(`Cache miss for: ${cacheKey}`);
  return null;
}

/**
 * Creates response headers for a cached response
 * @param {Object} cachedResponse - The cached response from R2
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @returns {Headers} - The headers for the response
 */
function createCachedResponseHeaders(cachedResponse, isStreaming) {
  const headers = new Headers();

  // Use the stored HTTP metadata if available
  if (cachedResponse.httpMetadata) {
    const metadata = cachedResponse.httpMetadata;

    if (metadata.contentType) headers.set('content-type', metadata.contentType);
    if (metadata.contentEncoding) headers.set('content-encoding', metadata.contentEncoding);
    if (metadata.contentDisposition) headers.set('content-disposition', metadata.contentDisposition);
    if (metadata.contentLanguage) headers.set('content-language', metadata.contentLanguage);
  } else {
    // Fallback to default content type
    headers.set('content-type', 'application/json; charset=utf-8');
  }

  // For streaming requests, set the appropriate content type
  if (isStreaming) {
    headers.set('content-type', 'text/event-stream; charset=utf-8');
  }

  // Always set these headers for cache control and CORS
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-cache', 'HIT');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type');

  return headers;
}

/**
 * Handles a cache miss by proxying to origin and potentially caching the response
 * @param {Request} request - The original request
 * @param {Object} env - The environment object
 * @param {string} cacheKey - The cache key
 * @param {URL} url - The request URL
 * @param {Object} ctx - The context object
 * @returns {Response} - The response from the origin
 */
async function handleCacheMiss(request, env, cacheKey, url, ctx) {
  console.log('Proxying request to origin service...');
  const response = await proxyToOrigin(request, env);

  // Only cache successful responses
  if (response.status === 200) {
    const contentType = response.headers.get('content-type') || '';
    const isTextResponse = contentType.includes('text/') ||
                          contentType.includes('application/json') ||
                          contentType.includes('application/javascript');
    const isStreamingResponse = contentType.includes('text/event-stream');

    // Cache both regular text responses and streaming responses
    if (isTextResponse || isStreamingResponse) {
      console.log('Caching successful text response');
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

/**
 * Creates a response from a cached R2 object
 * @param {Object} cachedResponse - The cached response from R2
 * @param {boolean} isStreaming - Whether this is a streaming request
 * @returns {Response} - The response to return to the client
 */
function createCachedResponse(cachedResponse, isStreaming) {
  const headers = createCachedResponseHeaders(cachedResponse, isStreaming);
  return new Response(cachedResponse.body, { headers });
}

export default {
  async fetch(request, env, ctx) {
    // Get basic request details
    const url = new URL(request.url);
    console.log(`Request: ${request.method} ${url.pathname}`);

    // Check if request should be cached
    if (!isCacheable(url)) {
      console.log('Skipping cache for non-cacheable request');
      return await proxyToOrigin(request, env);
    }

    // Parse request body for POST requests
    const { requestBody, requestClone } = await parseRequestBody(request);

    // If parsing failed for a POST request, proxy directly to origin
    if (request.method === 'POST' && requestBody === null) {
      return await proxyToOrigin(requestClone, env);
    }

    // Check if this is a streaming request
    const streaming = isStreamingRequest(url, requestBody);

    // Generate cache key
    const cacheKey = generateCacheKey(url, requestBody);
    console.log('Cache key:', cacheKey);

    // Try to get cached response
    const cachedResponse = await getCachedResponse(env, cacheKey);

    // Return cached response if available
    if (cachedResponse) {
      return createCachedResponse(cachedResponse, streaming);
    }

    // Handle cache miss
    return handleCacheMiss(requestClone, env, cacheKey, url, ctx);
  }
};