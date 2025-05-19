// No imports needed for Web Crypto API

// Worker version to track which deployment is running
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
function prepareMetadata(request, url, response, contentSize, isStreaming) {
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
    log('error', `Failed to cache request body: ${err.message}`);
    return false;
  }
}

/**
 * Main worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    try {
      // Parse request URL
      const url = new URL(request.url);
      
      // Log request information
      log('request', `${request.method} ${url.pathname}`);
      
      // Check if the path should be excluded from caching
      if (NON_CACHE_PATHS.some(path => url.pathname.startsWith(path))) {
        log('request', `Path ${url.pathname} excluded from caching, proxying directly`);
        return await proxyRequest(request, env);
      }
      
      // Generate a cache key for the request
      const key = await generateCacheKey(request);
      log('cache', `Key: ${key}`);
      
      // Try to get the cached response
      const cachedResponse = await getCachedResponse(env, key);
      if (cachedResponse) {
        log('cache', '✅ Cache hit!');
        return cachedResponse;
      }
      
      log('cache', 'Cache miss, proxying to origin...');
      
      // Forward the request to the origin server
      const originResp = await proxyRequest(request, env);
      
      // Don't cache error responses
      if (originResp.status >= 400) {
        log('cache', `Not caching error response with status ${originResp.status}`);
        return originResp;
      }
      
      // Process headers for the response
      const responseHeaders = prepareResponseHeaders(originResp.headers, {
        cacheStatus: 'MISS',
        cacheKey: key
      });
      
      // Check if the response is streaming (for events and chunked responses)
      const contentType = originResp.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || 
                          originResp.headers.get('transfer-encoding') === 'chunked';
      
      if (isStreaming) {
        log('stream', 'Streaming response detected');
        
        // Only proceed if body is available
        if (!originResp.body) {
          log('stream', '❌ No response body available');
          return originResp;
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
                
                // Use the helper function to prepare metadata
                const metadata = prepareMetadata(request, url, originResp, totalSize, isStreaming);
                
                log('cache', 'Saving metadata with keys:', Object.keys(metadata).join(', '));
                
                // Store in R2 with comprehensive metadata
                await env.TEXT_BUCKET.put(key, completeResponse, {
                  customMetadata: metadata
                });
                
                log('cache', `✅ Response cached successfully (${totalSize} bytes)`);
                
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
          headers: responseHeaders
        });
      } else {
        // For non-streaming responses, clone and cache in the background
        const clonedResp = originResp.clone();
        
        ctx.waitUntil(
          (async () => {
            try {
              const responseData = await clonedResp.arrayBuffer();
              
              // Use the helper function to prepare metadata for non-streaming responses
              const metadata = prepareMetadata(request, url, originResp, responseData.byteLength, false);
              
              log('cache', 'Saving metadata with keys:', Object.keys(metadata).join(', '));
              
              await env.TEXT_BUCKET.put(key, responseData, {
                customMetadata: metadata
              });
              
              log('cache', `✅ Response cached successfully (${responseData.byteLength} bytes)`);
            } catch (err) {
              log('error', `❌ Cache failed: ${err.message}`);
              if (err.stack) log('error', `Stack: ${err.stack}`);
            }
          })()
        );
        
        return new Response(originResp.body, {
          status: originResp.status,
          statusText: originResp.statusText,
          headers: responseHeaders
        });
      }
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
  const url = new URL(request.url);
  const parts = [
    request.method,
    url.pathname,
    url.search
  ];
  
  // Add body for POST/PUT requests if present
  if ((request.method === 'POST' || request.method === 'PUT') && request.body) {
    try {
      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();
      if (bodyText) {
        parts.push(bodyText);
      }
    } catch (err) {
      logMain(`Error including body in cache key: ${err.message}`);
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
  
  return headers;
}

/**
 * Prepare forwarded headers for proxying the request
 */
function prepareForwardedHeaders(requestHeaders, url) {
  const headers = new Headers(requestHeaders);
  
  // Add standard forwarded headers
  headers.set('X-Forwarded-Host', url.host);
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
      metadata: cachedObject.customMetadata
    });
    
    const metadata = cachedObject.customMetadata || {};
    
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
