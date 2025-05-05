import { generateCacheKey, cacheResponse, uploadStreamToR2 } from './cache-utils.js';
import { proxyToOrigin } from './text-proxy.js';

const NON_CACHE_PATHS = ['/models', '/feed', '/openai/models'];

//‑‑ utility ----------------------------------------------------
const isCacheable = u => {
  const hasNoCache = u.searchParams.has('no-cache');
  const isNonCachePath = NON_CACHE_PATHS.some(p => u.pathname.startsWith(p));

  console.log('Path cacheable check:', {
    path: u.pathname,
    hasNoCache,
    isNonCachePath,
    isCacheable: !hasNoCache && !isNonCachePath
  });

  return !hasNoCache && !isNonCachePath;
};

async function parseBody(req) {
  console.log('Parsing body for request method:', req.method);

  if (req.method !== 'POST') {
    console.log('Not a POST request, skipping body parsing');
    return { body:null, clone:req };
  }

  const clone = req.clone();

    const body = await req.json();
    console.log('Successfully parsed request body, keys:', Object.keys(body));

    // Log message content lengths if present
    if (body.messages && Array.isArray(body.messages)) {
      console.log('Request contains messages array with', body.messages.length, 'messages');
      body.messages.forEach((msg, idx) => {
        if (msg.content) {
          console.log(`Message ${idx} (${msg.role}): content length =`, msg.content.length);
        }
      });
    }

    return { body, clone };

}

const getCached = async (env, key) => {
  console.log('Checking cache for key:', key);

  try {
    const result = await env.TEXT_BUCKET.get(key, { httpMetadata: true, customMetadata: true });

    if (result) {
      console.log('Cache HIT for key:', key);

      // Log basic metadata
      const responseSize = result.customMetadata?.responseSize || 'unknown';
      const isStreaming = result.customMetadata?.isStreaming === 'true';

      console.log(`Cached response: ${isStreaming ? 'streaming' : 'non-streaming'}, size: ${responseSize} bytes`);

      // Calculate age of cached item
      if (result.customMetadata?.cachedAt) {
        const cachedTime = new Date(result.customMetadata.cachedAt).getTime();
        const now = new Date().getTime();
        const ageInSeconds = Math.floor((now - cachedTime) / 1000);
        console.log('Cache item age:', ageInSeconds, 'seconds');
      }

      // Validate streaming response size
      if (isStreaming &&
          responseSize !== 'unknown' &&
          parseInt(responseSize) < 100) {
        console.log('Warning: Streaming response cache hit but size is suspiciously small');
      }
    } else {
      console.log('Cache MISS for key:', key);
    }

    return result;
  } catch (error) {
    console.error('Error retrieving from cache:', error);
    return null;
  }
};

const headersForCached = obj => {
  const h = new Headers();
  const wasStreaming = obj.customMetadata?.isStreaming === 'true';

  // Set content type
  h.set('content-type',
        wasStreaming ? 'text/event-stream; charset=utf-8'
                     : (obj.httpMetadata?.contentType ||
                        'application/json; charset=utf-8'));

  // Set original response headers if available
  const contentEncoding = obj.customMetadata?.response_content_encoding;
  if (contentEncoding) {
    h.set('content-encoding', contentEncoding);
  }

  // Set vary header if it was in the original response
  const vary = obj.customMetadata?.response_vary;
  if (vary) {
    h.set('vary', vary);
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

    // CORS pre‑flight
    if (request.method === 'OPTIONS')
      return new Response(null,{ headers:{
        'access-control-allow-origin':'*',
        'access-control-allow-methods':'GET, POST, OPTIONS',
        'access-control-allow-headers':'Content-Type, Authorization, X-Requested-With',
        'access-control-max-age':'86400'
      }});

    if (!isCacheable(url)) return proxyToOrigin(request, env);

    const { body:reqBody, clone:reqClone } = await parseBody(request);
    if (request.method === 'POST' && reqBody === null)
      return proxyToOrigin(reqClone, env);

    const key = await generateCacheKey(url, reqBody);
    console.log('Generated cache key:', key);
    console.log('Checking cache for key:', key);

    // Check if this is a streaming request (for logging purposes)
    const isStreamingRequest = reqBody?.stream === true;
    if (isStreamingRequest) {
      console.log('Streaming request detected');
    }

    const hit = await getCached(env, key);
    if (hit) {
      console.log('Cache HIT for key:', key);

      // For streaming responses, we need to ensure proper content handling
      // Create headers for the cached response
      const headers = headersForCached(hit);

      // Add the cache key to the response headers for debugging
      headers.set('x-debug-cache-key', key);

      console.log('Returning cached response with headers:');
      headers.forEach((value, name) => {
        console.log(`  ${name}: ${value}`);
      });

      // Create a new response with the cached body and headers
      // This ensures proper handling of the content encoding
      return new Response(hit.body, {
        headers,
        // Don't set encoding options - let the browser handle it naturally
      });
    } else {
      console.log('Cache MISS for key:', key);
    }

    try {
      // cache miss → proxy
      const originResp = await proxyToOrigin(reqClone, env);
      const clientHdrs = new Headers(originResp.headers);
      clientHdrs.set('x-cache','MISS');

      if (!originResp.ok) {
        // If the origin response is not OK, just return it without caching
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
        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: clientHdrs
        });
      }

      // For streaming responses
      if (isStreaming) {
        console.log('Handling streaming response for key:', key);

        // Create clean headers for the response
        const cleanHeaders = new Headers(clientHdrs);

        // Remove problematic headers
        if (cleanHeaders.has('content-encoding')) {
          cleanHeaders.delete('content-encoding'); // Prevents double-compression
        }
        if (cleanHeaders.get('cache-control') === 'no-cache') {
          cleanHeaders.delete('cache-control'); // Allows caching
        }

        // Tee the stream so we can send one to the client and one to R2
        const [clientStream, cacheStream] = originResp.body.tee();

        // Cache the response in the background
        ctx.waitUntil(
          uploadStreamToR2(cacheStream, env.TEXT_BUCKET, key, originResp, url.toString(), request)
            .then(() => console.log('✅ Streaming response cached successfully'))
            .catch(err => console.error('❌ Streaming cache failed:', err))
        );

        // Add debug header
        cleanHeaders.set('x-debug-cache-key', key);

        // Return the client stream immediately
        return new Response(clientStream, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: cleanHeaders
        });
      } else {
        // For non-streaming responses
        ctx.waitUntil(
          cacheResponse(env.TEXT_BUCKET, key, originResp.clone(), url.toString(), request)
            .then(() => console.log('✅ Response cached successfully'))
            .catch(err => console.error('❌ Cache failed:', err))
        );

        // Add debug header
        clientHdrs.set('x-debug-cache-key', key);

        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: clientHdrs
        });
      }
    } catch (error) {
      // If there's an error, log it and return an error response to the client
      console.error('Error in request handling:', error);
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
