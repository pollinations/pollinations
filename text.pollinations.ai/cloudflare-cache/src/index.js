import { generateCacheKey, cacheResponse, uploadStreamToR2 } from './cache-utils.js';
import { proxyToOrigin } from './text-proxy.js';
import debug from 'debug';

// Initialize debug loggers
const logMain = debug('cache:main');
const logCache = debug('cache:cache');
const logHeaders = debug('cache:headers');

const NON_CACHE_PATHS = ['/models', '/feed', '/openai/models'];

//‑‑ utility ----------------------------------------------------
/**
 * Normalize response headers for caching
 * @param {Headers} headers - Original headers
 * @param {string} key - Cache key for debugging
 * @returns {Headers} - Normalized headers
 */
const normalizeHeaders = (headers, key) => {
  const h = new Headers(headers);

  // Remove content-encoding to prevent double-compression
  if (h.has('content-encoding')) {
    logHeaders('Removing content-encoding header');
    h.delete('content-encoding');
  }

  // Remove cache-control: no-cache to allow caching
  if (h.get('cache-control') === 'no-cache') {
    logHeaders('Removing cache-control: no-cache header');
    h.delete('cache-control');
  }

  // Add debug header
  if (key) {
    h.set('x-debug-cache-key', key);
  }

  return h;
};

/**
 * Check if a URL is cacheable
 */
const isCacheable = u => {
  const hasNoCache = u.searchParams.has('no-cache');
  const isNonCachePath = NON_CACHE_PATHS.some(p => u.pathname.startsWith(p));
  const result = !hasNoCache && !isNonCachePath;

  logMain('Path: %s, hasNoCache: %s, isNonCachePath: %s, isCacheable: %s',
    u.pathname, hasNoCache, isNonCachePath, result);

  return result;
};

/**
 * Parse the request body if it's a POST request
 */
async function parseBody(req) {
  logMain('Parsing body for request method: %s', req.method);

  if (req.method !== 'POST') {
    logMain('Not a POST request, skipping body parsing');
    return { body: null, clone: req.clone() };
  }

  const clone = req.clone();
  let body = null;

  try {
    body = await req.json();
    logMain('Successfully parsed request body, keys: %o', Object.keys(body));

    // Log message content lengths if present
    if (body.messages && Array.isArray(body.messages)) {
      logMain('Request contains %d messages', body.messages.length);
      body.messages.forEach((msg, idx) => {
        if (msg.content) {
          logMain('Message %d (%s): content length = %d',
            idx, msg.role, msg.content.length);
        }
      });
    }
  } catch (error) {
    logMain('Failed to parse request body as JSON: %o', error);
  }

  return { body, clone };
}

/**
 * Get a cached response from R2
 */
const getCached = async (env, key) => {
  logCache('Checking cache for key: %s', key);

  try {
    const result = await env.TEXT_BUCKET.get(key, { httpMetadata: true, customMetadata: true });

    if (result) {
      // Log basic metadata
      const responseSize = result.customMetadata?.responseSize || 'unknown';
      const isStreaming = result.customMetadata?.isStreaming === 'true';

      logCache('Cache HIT for key: %s', key);
      logCache('Cached response: %s, size: %s bytes',
        isStreaming ? 'streaming' : 'non-streaming', responseSize);

      // Calculate age of cached item
      if (result.customMetadata?.cachedAt) {
        const cachedTime = new Date(result.customMetadata.cachedAt).getTime();
        const now = new Date().getTime();
        const ageInSeconds = Math.floor((now - cachedTime) / 1000);
        logCache('Cache item age: %d seconds', ageInSeconds);
      }

      // Validate streaming response size
      if (isStreaming &&
          responseSize !== 'unknown' &&
          parseInt(responseSize) < 100) {
        logCache('Warning: Streaming response cache hit but size is suspiciously small');
      }
    } else {
      logCache('Cache MISS for key: %s', key);
    }

    return result;
  } catch (error) {
    logCache('Error retrieving from cache: %o', error);
    return null;
  }
};

/**
 * Create headers for a cached response
 */
const headersForCached = obj => {
  const h = new Headers();
  const wasStreaming = obj.customMetadata?.isStreaming === 'true';

  // Set content type
  const contentType = wasStreaming
    ? 'text/event-stream; charset=utf-8'
    : (obj.httpMetadata?.contentType || 'application/json; charset=utf-8');

  h.set('content-type', contentType);
  logHeaders('Setting content-type: %s', contentType);

  // Set original response headers if available
  const contentEncoding = obj.customMetadata?.response_content_encoding;
  if (contentEncoding) {
    h.set('content-encoding', contentEncoding);
    logHeaders('Setting content-encoding: %s', contentEncoding);
  }

  // Set vary header if it was in the original response
  const vary = obj.customMetadata?.response_vary;
  if (vary) {
    h.set('vary', vary);
    logHeaders('Setting vary: %s', vary);
  }

  // Cache control headers - always use our cache-friendly headers
  // regardless of what the origin sent
  h.set('cache-control','public, max-age=31536000, immutable');
  h.set('x-cache','HIT');
  h.set('x-cached-at', obj.customMetadata?.cachedAt || 'unknown');
  h.set('access-control-allow-origin','*');

  return h;
};
//‑‑ main -------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    logMain('Request URL: %s', url.toString());

    // CORS pre‑flight
    if (request.method === 'OPTIONS') {
      logMain('Handling CORS preflight request');
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
          'access-control-max-age': '86400'
        }
      });
    }

    if (!isCacheable(url)) {
      logMain('URL not cacheable, proxying to origin');
      return proxyToOrigin(request, env);
    }

    const { body: reqBody, clone: reqClone } = await parseBody(request);
    if (request.method === 'POST' && reqBody === null) {
      logMain('POST request with null body, proxying to origin');
      return proxyToOrigin(reqClone, env);
    }

    const key = await generateCacheKey(url, reqBody);
    logMain('Generated cache key: %s', key);

    // Check if this is a streaming request (for logging purposes)
    const isStreamingRequest = reqBody?.stream === true;
    if (isStreamingRequest) {
      logMain('Streaming request detected');
    }

    const hit = await getCached(env, key);
    if (hit) {
      logMain('Cache HIT for key: %s', key);

      // Create headers for the cached response
      const headers = headersForCached(hit);

      // Add the cache key to the response headers for debugging
      headers.set('x-debug-cache-key', key);

      logHeaders('Returning cached response with headers:');
      for (const [name, value] of headers.entries()) {
        logHeaders('  %s: %s', name, value);
      }

      // Create a new response with the cached body and headers
      return new Response(hit.body, {
        headers,
        // Don't set encoding options - let the browser handle it naturally
      });
    } else {
      logMain('Cache MISS for key: %s', key);
    }

    try {
      // Cache miss → proxy to origin
      logMain('Proxying request to origin');
      const originResp = await proxyToOrigin(reqClone, env);

      // Create headers for the client response
      const clientHdrs = new Headers(originResp.headers);
      clientHdrs.set('x-cache', 'MISS');

      if (!originResp.ok) {
        // If the origin response is not OK, just return it without caching
        logMain('Origin response not OK (%d), skipping cache', originResp.status);
        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: clientHdrs
        });
      }

      const ct = originResp.headers.get('content-type') || '';
      const isStreaming = ct.startsWith('text/event-stream');
      const textish = ct.startsWith('text/') || ct.includes('application/json');

      if (!textish) {
        // If it's not a text response, just return it without caching
        logMain('Non-text response (%s), skipping cache', ct);
        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: clientHdrs
        });
      }

      // For streaming responses
      if (isStreaming) {
        logMain('Handling streaming response for key: %s', key);

        // Create clean headers for the response
        const cleanHeaders = normalizeHeaders(clientHdrs, key);

        // Tee the stream so we can send one to the client and one to R2
        const [clientStream, cacheStream] = originResp.body.tee();

        // Cache the response in the background
        ctx.waitUntil(
          uploadStreamToR2(cacheStream, env.TEXT_BUCKET, key, originResp, url.toString(), request)
            .then(() => logMain('✅ Streaming response cached successfully'))
            .catch(err => logMain('❌ Streaming cache failed: %o', err))
        );

        // Return the client stream immediately
        return new Response(clientStream, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: cleanHeaders
        });
      } else {
        // For non-streaming responses
        logMain('Handling non-streaming response for key: %s', key);

        // Add debug header
        clientHdrs.set('x-debug-cache-key', key);

        // Cache the response in the background
        ctx.waitUntil(
          cacheResponse(env.TEXT_BUCKET, key, originResp.clone(), url.toString(), request)
            .then(() => logMain('✅ Response cached successfully'))
            .catch(err => logMain('❌ Cache failed: %o', err))
        );

        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: clientHdrs
        });
      }
    } catch (error) {
      // If there's an error, log it and return an error response to the client
      logMain('Error in request handling: %o', error);
      return new Response(JSON.stringify({
        error: 'proxy_error',
        message: error.message,
        stack: error.stack
      }), {
        status: 502,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*'
        }
      });
    }
  }
};
