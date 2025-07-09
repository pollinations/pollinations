// No imports needed for Web Crypto API

// Worker version to track which deployment is running
import { createEmbeddingService, generateEmbedding } from './embedding-service.js';
import { createSemanticCache, findSimilarText, cacheTextEmbedding } from './semantic-cache.js';
import { extractAndNormalizeSemanticText, extractModelName } from './text-extractor.js';

const WORKER_VERSION = "2.0.0-simplified";

// Unified logging function with category support
function log(category, message, ...args) {
  const prefix = category ? `[${category}]` : '';
  console.log(`[${WORKER_VERSION}]${prefix} ${message}`, ...args);
}

const NON_CACHE_PATHS = ['/models', '/feed', '/openai/models'];

/**
 * Prepare metadata for caching
 */
function prepareMetadata(request, url, response, contentSize, isStreaming, hasRequestBody = false) {
  // Create metadata object with core response properties
  const metadata = {
    // Original URL information
    originalUrl: url.toString(),
    cachedAt: new Date().toISOString(),
    isStreaming: isStreaming.toString(),
    responseSize: contentSize.toString(),
    
    // Response metadata
    response_content_type: response.headers.get('content-type') || '',
    response_cache_control: response.headers.get('cache-control') || '',
    method: request.method,
    status: response.status.toString(),
    statusText: response.statusText,
    
    // Request body reference
    hasRequestBody: hasRequestBody.toString(),
    
    // Original headers as JSON for future reconstruction
    headers: JSON.stringify(Object.fromEntries(response.headers))
  };
  
  // Add all request headers to metadata - no transformation
  for (const [key, value] of request.headers.entries()) {
    metadata[key] = value;
  }
  
  // Add all Cloudflare-specific data from the cf object if available
  if (request.cf && typeof request.cf === 'object') {
    // Add all properties from request.cf without transformation
    for (const [key, value] of Object.entries(request.cf)) {
      // Convert any non-string values to strings
      if (value !== null && value !== undefined) {
        metadata[key] = typeof value === 'string' ? value : String(value);
      }
    }
  }
  
  return metadata;
}

/**
 * Store request body separately if it exists
 * This follows the thin proxy design principle by keeping the implementation simple
 */
async function storeRequestBody(env, request, key) {
  // Only process POST/PUT requests that might have a body
  if ((request.method !== 'POST' && request.method !== 'PUT') || !request.body) {
    return false;
  }
  
  try {
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();
    
    // Only store if there's actual content
    if (!bodyText || bodyText.length === 0) {
      return false;
    }
    
    // Use a predictable key pattern
    const requestKey = `${key}-request`;
    
    // Store the request body as-is
    await env.TEXT_BUCKET.put(requestKey, bodyText);
    log('cache', `Stored request body separately (${bodyText.length} bytes) with key: ${requestKey}`);
    return true;
  } catch (err) {
    log("body is not a string. probably a binary file. won't save to cache.");
    return false;
  }
}

/**
 * Handles requests to the /embedding endpoint.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleEmbeddingRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return new Response('Invalid request body, "text" field is required.', { status: 400 });
    }

    log('Generating embedding for text:', text.slice(0, 50) + '...');

    const embeddingService = createEmbeddingService(env.AI);
    const embedding = await generateEmbedding(embeddingService, text);

    log('Successfully generated embedding of size:', embedding.length);

    return new Response(JSON.stringify(embedding), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in /embedding endpoint:', error);
    log('Error in /embedding endpoint:', error.message);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Main worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    const semanticCache = createSemanticCache(env);
    try {
      // Parse request URL
      const url = new URL(request.url);
      const pathname = url.pathname;
      
      // Log request information
      log('request', `${request.method} ${pathname}`);
      
      // Check if the path should be excluded from caching
      if (NON_CACHE_PATHS.some(path => pathname.startsWith(path))) {
        log('request', `Path ${pathname} excluded from caching, proxying directly`);
        return await proxyRequest(request, env);
      }
      
      // Handle the new /embedding endpoint
      if (pathname === '/embedding') {
        return handleEmbeddingRequest(request, env);
      }
      
      // Generate a cache key for the request
      const key = await generateCacheKey(request);
      log('cache', `Key: ${key}`);
      
      // Capture request text and model name early for semantic caching (before consuming the stream)
      let requestText = null;
      let modelName = 'unknown';
      if (request.method === 'POST' && request.body) {
        try {
          const rawBody = await request.clone().text();
          requestText = extractAndNormalizeSemanticText(rawBody);
          modelName = extractModelName(rawBody);
          log('cache', `Extracted semantic text (${requestText.length} chars): ${requestText.substring(0, 100)}...`);
          log('cache', `Extracted model name: ${modelName}`);
        } catch (err) {
          log('cache', 'Could not read request body for semantic caching');
          requestText = url.toString(); // fallback to URL
        }
      } else {
        requestText = url.toString();
      }

      // Try to get the cached response
      let cachedResponse = await getCachedResponse(env, key);

      // Store similarity info for later use in headers
      let semanticSimilarity = null;
      
      if (!cachedResponse) {
        const similar = await findSimilarText(semanticCache, requestText, modelName);
        if (similar) {
          semanticSimilarity = similar.similarity;
          if (similar.aboveThreshold && similar.cacheKey) {
            cachedResponse = await getCachedResponse(env, similar.cacheKey);
            if (cachedResponse) {
              console.log(`[CACHE] Semantic HIT for model ${modelName}. Key: ${similar.cacheKey}, Similarity: ${similar.similarity}`);
              cachedResponse.headers.set('x-cache-type', 'semantic');
              cachedResponse.headers.set('x-semantic-similarity', similar.similarity.toString());
              cachedResponse.headers.set('x-cache-model', similar.model || modelName);
            } else {
              console.log(`[CACHE] Semantic match found but R2 object ${similar.cacheKey} is missing.`);
            }
          }
        }
      }

      if (cachedResponse) {
        log('cache', '✅ Cache hit!');
        // Add cache debug headers for exact hit
        cachedResponse.headers.set('x-cache-type', 'hit');
        if (modelName) {
          cachedResponse.headers.set('x-cache-model', modelName);
        }
        return cachedResponse;
      }
      
      log('cache', 'Cache miss, proxying to origin...');
      
      // Store the request body if present (for POST/PUT requests)
      const hasRequestBody = await storeRequestBody(env, request, key);
      
      // Forward the request to the origin server
      const originResp = await proxyRequest(request, env);
      
      // Don't cache error responses
      if (originResp.status >= 401) {
        log('cache', `Not caching error response with status ${originResp.status}`);
        
        // Add cache debug headers even for error responses
        const errorResponse = new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: originResp.headers
        });
        
        errorResponse.headers.set('x-cache-type', 'miss');
        if (modelName) {
          errorResponse.headers.set('x-cache-model', modelName);
        }
        
        return errorResponse;
      }
      
      // Determine if this is a streaming response
      const contentLength = originResp.headers.get('content-length');
      const isStreaming = !contentLength || parseInt(contentLength) > 10 * 1024 * 1024; // 10MB threshold
      
      log('cache', `Response type: ${isStreaming ? 'streaming' : 'regular'} (content-length: ${contentLength || 'not set'})`);
      
      // Handle regular (non-streaming) responses
      if (!isStreaming) {
        try {
          const responseClone = originResp.clone();
          const content = await responseClone.arrayBuffer();
          
          // Prepare metadata with request body reference
          const metadata = prepareMetadata(request, url, originResp, content.byteLength, false, hasRequestBody);
          
          // Store the response in R2 with metadata
          await env.TEXT_BUCKET.put(key, content, {
            customMetadata: metadata
          });
          await cacheTextEmbedding(semanticCache, key, requestText, modelName);
          
          // Add cache debug headers for miss
          const responseWithHeaders = new Response(originResp.body, {
            status: originResp.status,
            statusText: originResp.statusText,
            headers: originResp.headers
          });
          responseWithHeaders.headers.set('x-cache-type', 'miss');
          if (modelName) {
            responseWithHeaders.headers.set('x-cache-model', modelName);
          }
          if (semanticSimilarity !== null && semanticSimilarity !== undefined) {
            responseWithHeaders.headers.set('x-semantic-similarity', semanticSimilarity.toString());
          }
          
          // Return the response with cache headers
          return responseWithHeaders;
        } catch (err) {
          log('error', `Error caching regular response: ${err.message}`);
          if (err.stack) log('error', `Stack: ${err.stack}`);
          // Add cache debug headers even if caching fails
          const responseWithHeaders = new Response(originResp.body, {
            status: originResp.status,
            statusText: originResp.statusText,
            headers: originResp.headers
          });
          responseWithHeaders.headers.set('x-cache-type', 'miss');
          if (modelName) {
            responseWithHeaders.headers.set('x-cache-model', modelName);
          }
          if (semanticSimilarity !== null && semanticSimilarity !== undefined) {
            responseWithHeaders.headers.set('x-semantic-similarity', semanticSimilarity.toString());
          }
          
          // Return origin response even if caching fails
          return responseWithHeaders;
        }
      }
      
      // This approach follows the "thin proxy" design principle:
      // 1. Send response directly to the client while collecting data for caching
      // 2. Cache the data after the stream is completely processed
      
      // Collect chunks as they pass through to the client
      let chunks = [];
      let totalSize = 0;
      
      // Create a transform stream that captures chunks as they flow through
      const captureStream = new TransformStream({
        transform(chunk, controller) {
          // Save a copy of the chunk for caching later
          chunks.push(chunk.slice());
          totalSize += chunk.byteLength;
          
          // Pass the chunk through unchanged to the client
          controller.enqueue(chunk);
        },
        flush(controller) {
          // This runs when the stream is complete
          log('stream', `🏁 Response streaming complete (${chunks.length} chunks, ${totalSize} bytes)`);
          
          // Cache the response in the background once streaming is done
          ctx.waitUntil((async () => {
            try {
              // Combine all chunks into a single buffer
              const completeResponse = new Uint8Array(totalSize);
              let offset = 0;
              
              for (const chunk of chunks) {
                completeResponse.set(chunk, offset);
                offset += chunk.byteLength;
              }
              
              log('cache', `📦 Caching complete response (${totalSize} bytes)`);
              
              // Prepare metadata with request body reference
              const metadata = prepareMetadata(request, url, originResp, totalSize, true, hasRequestBody);
              
              log('cache', 'Saving metadata with keys:', Object.keys(metadata).join(', '));
              
              // Store in R2 with comprehensive metadata
              await env.TEXT_BUCKET.put(key, completeResponse, {
                customMetadata: metadata
              });
              
              log('cache', `✅ Response cached successfully (${totalSize} bytes)`);
              
              // Cache the text embedding asynchronously
              ctx.waitUntil(cacheTextEmbedding(semanticCache, key, requestText, modelName));
              
              // Free memory
              chunks = null;
            } catch (err) {
              log('error', `❌ Caching failed: ${err.message}`);
              if (err.stack) log('error', `Stack: ${err.stack}`);
            }
          })());
        }
      });
      
      // Pipe the response through our capture stream
      const transformedStream = originResp.body.pipeThrough(captureStream);
      
      // Return the stream to the client immediately
      return new Response(transformedStream, {
        status: originResp.status,
        statusText: originResp.statusText,
        headers: prepareResponseHeaders(originResp.headers, {
          cacheStatus: 'MISS',
          cacheKey: key,
          cacheType: 'miss',
          cacheModel: modelName,
          semanticSimilarity: semanticSimilarity
        })
      });
    } catch (err) {
      log('error', `❌ Worker error: ${err.message}`);
      if (err.stack) log('error', `Stack: ${err.stack}`);
      
      return new Response(`Worker error: ${err.message}`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'X-Error': err.message
        }
      });
    }
  }
};

/**
 * Proxy the request to the origin server
 */
async function proxyRequest(request, env) {
  const url = new URL(request.url);
  
  // Construct origin URL
  let originHost = env.ORIGIN_HOST;
  if (!originHost.startsWith('http://') && !originHost.startsWith('https://')) {
    originHost = `https://${originHost}`;
  }
  
  const originUrl = new URL(url.pathname + url.search, originHost);
  log('proxy', `Proxying to: ${originUrl.toString()}`);
  
  // Prepare forwarded headers
  const headers = prepareForwardedHeaders(request.headers, url);
  
  log('headers', 'Request headers:', Object.fromEntries(headers));
  
  // Create origin request
  const originRequest = new Request(originUrl.toString(), {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'manual'
  });
  
  // Send the request to the origin
  return await fetch(originRequest);
}

/**
 * Generate a cache key for the request
 */
async function generateCacheKey(request) {
  // Authentication parameters to exclude from cache key
  const AUTH_PARAMS = ['token', 'referrer', 'referer', 'nofeed', 'no-cache'];

  const url = new URL(request.url);
  
  // Filter query parameters, excluding auth params
  const filteredParams = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!AUTH_PARAMS.includes(key.toLowerCase())) {
      filteredParams.append(key, value);
    }
  }
  
  const parts = [
    request.method,
    url.pathname,
    filteredParams.toString() // Only include non-auth query params
  ];
  
  // Add filtered body for POST/PUT requests
  if ((request.method === 'POST' || request.method === 'PUT') && request.body) {
    try {
      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();
      
      if (bodyText) {
        try {
          // Try to parse as JSON and filter auth fields
          const bodyObj = JSON.parse(bodyText);
          const filteredBody = Object.entries(bodyObj)
            .filter(([key]) => !AUTH_PARAMS.includes(key.toLowerCase()))
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
            
          parts.push(JSON.stringify(filteredBody));
        } catch {
          // If not JSON, use body as-is (but this shouldn't happen for our API)
          parts.push(bodyText);
        }
      }
    } catch (err) {
      log('error', `Error processing body for cache key: ${err.message}`);
    }
  }
  
  // Generate a hash of all parts using Web Crypto API
  const text = parts.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert hash to hex string
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Prepare response headers by cleaning problematic ones and adding cache info
 */
function prepareResponseHeaders(originalHeaders, cacheInfo = {}) {
  const headers = new Headers(originalHeaders);
  
  // Remove problematic headers
  const headersToRemove = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
  ];
  
  for (const header of headersToRemove) {
    headers.delete(header);
  }
  
  // Add cache-related headers if provided
  if (cacheInfo.cacheStatus) {
    headers.set('X-Cache', cacheInfo.cacheStatus);
  }
  
  if (cacheInfo.cacheKey) {
    headers.set('X-Cache-Key', cacheInfo.cacheKey);
  }
  
  if (cacheInfo.cacheDate) {
    headers.set('X-Cache-Date', cacheInfo.cacheDate);
  }
  
  // Add debug headers for cache type and model
  if (cacheInfo.cacheType) {
    headers.set('x-cache-type', cacheInfo.cacheType);
  }
  
  if (cacheInfo.cacheModel) {
    headers.set('x-cache-model', cacheInfo.cacheModel);
  }
  
  if (cacheInfo.semanticSimilarity !== null && cacheInfo.semanticSimilarity !== undefined) {
    headers.set('x-semantic-similarity', cacheInfo.semanticSimilarity.toString());
  }
  
  return headers;
}

/**
 * Prepare forwarded headers for proxying the request
 */
function prepareForwardedHeaders(requestHeaders, url) {
  const headers = new Headers(requestHeaders);
  
  // Add standard forwarded headers (but NOT X-Forwarded-Host to avoid referrer confusion)
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  
  // Forward client IP address
  const clientIp = requestHeaders.get('cf-connecting-ip') || 
                  requestHeaders.get('x-forwarded-for') || 
                  '0.0.0.0';
  headers.set('X-Forwarded-For', clientIp);
  headers.set('X-Real-IP', clientIp);
  headers.set('CF-Connecting-IP', clientIp);
  
  return headers;
}

/**
 * Get a cached response from R2
 */
async function getCachedResponse(env, key) {
  try {
    // Get the cached object from R2
    const cachedObject = await env.TEXT_BUCKET.get(key);
    
    if (!cachedObject) {
      return null;
    }
    
    log('cache', 'Found cached object:', {
      key,
      size: cachedObject.size,
      uploaded: cachedObject.uploaded,
      metadata: cachedObject.customMetadata,
      hasRequestBody: cachedObject.customMetadata?.hasRequestBody === 'true'
    });
    
    const metadata = cachedObject.customMetadata || {};
    
    // Optionally log if there's an associated request body
    if (metadata.hasRequestBody === 'true') {
      log('cache', `Associated request body available at: ${key}-request`);
    }
    
    // Prepare headers based on metadata
    const cacheHeaders = {
      cacheStatus: 'HIT',
      cacheKey: key,
      cacheDate: metadata.timestamp || cachedObject.uploaded.toISOString()
    };
    
    // Create response headers with original headers and cache info
    let originalHeaders = {};
    if (metadata.headers) {
      try {
        originalHeaders = JSON.parse(metadata.headers);
      } catch (err) {
        log('error', `Error parsing headers from cache: ${err.message}`);
      }
    }
    
    // If content-type is in metadata, ensure it's used
    if (metadata.contentType && !originalHeaders['content-type']) {
      originalHeaders['content-type'] = metadata.contentType;
    }
    
    // Prepare the response headers
    const responseHeaders = prepareResponseHeaders(new Headers(originalHeaders), cacheHeaders);
    
    // Create response from cached object
    return new Response(cachedObject.body, {
      status: parseInt(metadata.status || '200', 10),
      statusText: metadata.statusText || 'OK',
      headers: responseHeaders
    });
  } catch (err) {
    log('error', `Error getting cached response: ${err.message}`);
    if (err.stack) log('error', `Stack: ${err.stack}`);
    return null;
  }
}

/**
 * Get a cached request body from R2
 */
async function getCachedRequest(env, key) {
  try {
    const requestKey = `${key}-request`;
    const cachedRequest = await env.TEXT_BUCKET.get(requestKey);
    
    if (!cachedRequest) {
      log('cache', `No cached request found for key: ${requestKey}`);
      return null;
    }
    
    const requestBody = await cachedRequest.text();
    log('cache', `Retrieved cached request body: ${requestKey} (${requestBody.length} bytes)`);
    
    return {
      body: requestBody,
      uploaded: cachedRequest.uploaded,
      size: cachedRequest.size
    };
  } catch (err) {
    log('error', `Error getting cached request: ${err.message}`);
    return null;
  }
}

/**
 * Get both cached request and response as a pair
 */
async function getCachedRequestResponsePair(env, key) {
  try {
    // Get both in parallel for efficiency
    const [response, request] = await Promise.all([
      getCachedResponse(env, key),
      getCachedRequest(env, key)
    ]);
    
    return {
      request,
      response,
      key
    };
  } catch (err) {
    log('error', `Error getting cached pair: ${err.message}`);
    return null;
  }
}

/**
 * List all cached request-response pairs (for debugging/analytics)
 * Note: This is a simple implementation - for production, consider pagination
 */
async function listCachedPairs(env, limit = 100) {
  try {
    const semanticCache = createSemanticCache(env);
    const list = await env.TEXT_BUCKET.list({ limit });
    
    // Group by base key (without -request suffix)
    const pairs = new Map();
    
    for (const object of list.objects) {
      const key = object.key;
      const baseKey = key.endsWith('-request') ? key.slice(0, -8) : key;
      
      if (!pairs.has(baseKey)) {
        pairs.set(baseKey, { response: null, request: null });
      }
      
      if (key.endsWith('-request')) {
        pairs.get(baseKey).request = {
          key,
          size: object.size,
          uploaded: object.uploaded
        };
      } else {
        pairs.get(baseKey).response = {
          key,
          size: object.size,
          uploaded: object.uploaded,
          metadata: object.customMetadata
        };
      }
    }
    
    return Array.from(pairs.entries()).map(([baseKey, pair]) => ({
      key: baseKey,
      ...pair
    }));
  } catch (err) {
    log('error', `Error listing cached pairs: ${err.message}`);
    return [];
  }
}
