import stringify from 'fast-json-stable-stringify';

const COMMON = ['model','seed','stream','temperature','max_tokens','top_p',
                'frequency_penalty','presence_penalty','stop','logit_bias'];
const GET_ONLY  = ['prompt','json','system'];
const POST_ONLY = ['messages','functions','function_call',
                   'tools','tool_choice','response_format'];

/* -------- key generation (unchanged) ------------------------------------ */
export async function generateCacheKey(url, body=null) {
  const u  = new URL(url);
  const qp = {};

  console.log('Generating cache key for URL:', u.toString());
  console.log('URL path length:', u.pathname.length);

  // Log body details
  if (body) {
    console.log('Request body type:', typeof body);
    console.log('Request body keys:', Object.keys(body));

    // Check for messages array
    if (body.messages && Array.isArray(body.messages)) {
      console.log('Messages count:', body.messages.length);

      // Log the length of each message content
      body.messages.forEach((msg, idx) => {
        if (msg.content) {
          console.log(`Message ${idx} role: ${msg.role}, content length: ${msg.content.length}`);
        }
      });
    }

    console.log('Request body preview:', JSON.stringify(body).substring(0, 200) + '...');
  }

  [...COMMON, ...GET_ONLY].forEach(p => {
    const vals = u.searchParams.getAll(p);
    if (vals.length) {
      console.log(`Found query param: ${p} with ${vals.length} values`);
      qp[p] = vals.map(v =>
        v === '' || v === 'true' ? true :
        v === 'false' ? false :
        Number.isFinite(+v) ? +v : v
      ).sort();
    }
  });

  const bodyPick = {};
  if (body) [...COMMON, ...POST_ONLY].forEach(f => {
    if (body[f] !== undefined) {
      console.log(`Including body field: ${f}`);
      bodyPick[f] = body[f];
    }
  });

  // Log the size of the bodyPick object
  console.log('Body pick size:', JSON.stringify(bodyPick).length);

  const canon = u.pathname +
                (Object.keys(qp).length ? '?' + stringify(qp) : '') +
                stringify(bodyPick);

  console.log('Canonical string length:', canon.length);
  console.log('Canonical string for hashing (preview):', canon);

  const digest = await crypto.subtle.digest('SHA-256',
                    new TextEncoder().encode(canon));
  const key = [...new Uint8Array(digest)]
          .map(b => b.toString(16).padStart(2,'0')).join('');

  console.log('Generated cache key:', key);
  return key;
}

/* -------- response caching --------------------------------------------- */
const TRIM = 512;
const sanitize = v =>
  v === undefined || v === null ? undefined
    : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, TRIM);

/**
 * Create metadata object for the cached response
 */
function createMetadata(resp, url='', req=null, responseSize=0) {
  const ct = resp.headers.get('content-type') || '';
  const wasStreaming = ct.startsWith('text/event-stream');

  /* ---- build metadata object in a generic way ---- */
  const meta = {
    originalUrl : sanitize(url),
    cachedAt    : new Date().toISOString(),
    isStreaming : wasStreaming.toString(),
    responseSize: responseSize
  };

  // Store important response headers
  const importantHeaders = [
    'content-type',
    'content-encoding',
    'transfer-encoding',
    'vary',
    'cache-control'
  ];

  importantHeaders.forEach(h => {
    const val = resp.headers.get(h);
    // Skip cache-control: no-cache header
    if (h === 'cache-control' && val === 'no-cache') {
      console.log('Skipping cache-control: no-cache header in metadata');
      return;
    }
    if (val) meta[`response_${h.replace(/-/g,'_')}`] = sanitize(val);
  });

  // chosen request headers
  ['cf-connecting-ip','x-forwarded-for','user-agent',
   'referer','referrer','accept-language','cf-ray'].forEach(h => {
      const val = req?.headers.get(h);
      if (val) meta[h.replace(/-/g,'_')] = sanitize(val);
  });
  meta.method = req?.method;

  // flatten request.cf (primitives only)
  const cf = req?.cf || {};
  for (const [k,v] of Object.entries(cf)) {
    if (typeof v !== 'object' || v === null) meta[k] = sanitize(v);
  }
  // stringify botManagement & detectionIds if present
  if (cf.botManagement)   meta.botManagement   = sanitize(cf.botManagement);
  if (cf.detectionIds)    meta.detectionIds    = sanitize(cf.detectionIds);

  return { meta, contentType: ct, wasStreaming };
}

/**
 * Cache a streaming response in R2
 * Collects all chunks and uploads them as a single object
 */
export async function uploadStreamToR2(stream, bucket, key, resp, url='', req=null) {
  console.log('Caching streaming response for key:', key);

  try {
    // Create metadata
    const { meta, contentType } = createMetadata(resp, url, req);

    // Collect all chunks
    const chunks = [];
    let totalSize = 0;
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Skip empty chunks
      if (!value || value.length === 0) continue;

      totalSize += value.byteLength;
      chunks.push(value);

      // Log less frequently to reduce verbosity
      if (chunks.length % 10 === 0) {
        console.log(`Collected ${chunks.length} chunks, total size so far: ${totalSize} bytes`);
      }
    }

    // Combine all chunks into a single buffer
    console.log(`Combining ${chunks.length} chunks, total size: ${totalSize} bytes`);
    const combinedChunks = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combinedChunks.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Update metadata with final size
    meta.responseSize = totalSize;

    // Upload the combined buffer
    console.log(`Uploading to R2, key: ${key}, size: ${totalSize} bytes`);
    await bucket.put(key, combinedChunks, {
      httpMetadata: { contentType },
      customMetadata: meta
    });

    console.log(`Upload complete for key: ${key}`);
    return { success: true, size: totalSize };
  } catch (error) {
    console.error('Error caching streaming response:', error);
    throw error; // Re-throw to be handled by the caller
  }
}

/** Store body + flexible metadata in R2 */
export async function cacheResponse(bucket, key, resp, url='', req=null) {
  console.log('Caching response for key:', key);
  console.log('URL being cached:', url);

  try {
    const clone = resp.clone();
    const ct = clone.headers.get('content-type') || '';
    const wasStreaming = ct.startsWith('text/event-stream');

    console.log('Content type:', ct, 'Streaming:', wasStreaming);

    // Log all headers for debugging
    console.log('Response headers:');
    clone.headers.forEach((value, name) => {
      console.log(`  ${name}: ${value}`);
    });

    // For non-streaming responses, use the traditional approach
    if (!wasStreaming) {
      const buf = await clone.arrayBuffer();
      console.log('Response size (bytes):', buf.byteLength);

      const { meta } = createMetadata(clone, url, req, buf.byteLength);

      console.log('Putting object in bucket with key:', key);
      await bucket.put(key, buf, {
        httpMetadata: { contentType: ct },
        customMetadata: meta
      });
      console.log('Successfully cached response for key:', key);
    } else {
      // For streaming responses, we don't do anything here
      // The streaming upload is handled separately in the main handler
      console.log('Streaming response detected - caching will be handled separately');
    }

    return resp;
  } catch (error) {
    console.error('Error caching response:', error);
    throw error; // Re-throw to be handled by the caller
  }
}
