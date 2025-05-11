import stringify from "fast-json-stable-stringify";
import debug from "debug";

// Initialize debug loggers
const logKey = debug("cache:key");
const logCache = debug("cache:cache");
const logMeta = debug("cache:meta");

const COMMON = [
  "model",
  "seed",
  "stream",
  "temperature",
  "max_tokens",
  "top_p",
  "frequency_penalty",
  "presence_penalty",
  "stop",
  "logit_bias",
];
const GET_ONLY = ["prompt", "json", "system"];
const POST_ONLY = [
  "messages",
  "functions",
  "function_call",
  "tools",
  "tool_choice",
  "response_format",
];

/* -------- key generation (unchanged) ------------------------------------ */
export async function generateCacheKey(url, body = null) {
  const u = new URL(url);
  const qp = {};

  logKey("Generating cache key for URL: %s", u.toString());
  logKey("URL path length: %d", u.pathname.length);

  // Log body details
  if (body) {
    logKey("Request body type: %s", typeof body);
    logKey("Request body keys: %o", Object.keys(body));

    // Check for messages array
    if (body.messages && Array.isArray(body.messages)) {
      logKey("Messages count: %d", body.messages.length);

      // Log the length of each message content
      body.messages.forEach((msg, idx) => {
        if (msg.content) {
          logKey(
            "Message %d role: %s, content length: %d",
            idx,
            msg.role,
            msg.content.length,
          );
        }
      });
    }

    logKey(
      "Request body preview: %s",
      JSON.stringify(body).substring(0, 200) + "...",
    );
  }

  [...COMMON, ...GET_ONLY].forEach((p) => {
    const vals = u.searchParams.getAll(p);
    if (vals.length) {
      logKey("Found query param: %s with %d values", p, vals.length);
      qp[p] = vals
        .map((v) =>
          v === "" || v === "true"
            ? true
            : v === "false"
              ? false
              : Number.isFinite(+v)
                ? +v
                : v,
        )
        .sort();
    }
  });

  const bodyPick = {};
  if (body)
    [...COMMON, ...POST_ONLY].forEach((f) => {
      if (body[f] !== undefined) {
        logKey("Including body field: %s", f);
        bodyPick[f] = body[f];
      }
    });

  // Log the size of the bodyPick object
  logKey("Body pick size: %d", JSON.stringify(bodyPick).length);

  const canon =
    u.pathname +
    (Object.keys(qp).length ? "?" + stringify(qp) : "") +
    stringify(bodyPick);

  logKey("Canonical string length: %d", canon.length);
  logKey(
    "Canonical string for hashing (preview): %s",
    canon.substring(0, 100) + "...",
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canon),
  );
  const key = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  logKey("Generated cache key: %s", key);
  return key;
}

/* -------- response caching --------------------------------------------- */
const TRIM = 512;
const sanitize = (v) =>
  v === undefined || v === null
    ? undefined
    : String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, TRIM);

/**
 * Create metadata object for the cached response
 */
function createMetadata(resp, url = "", req = null, responseSize = 0) {
  const ct = resp.headers.get("content-type") || "";
  const wasStreaming = ct.startsWith("text/event-stream");

  logMeta(
    "Creating metadata for %s response",
    wasStreaming ? "streaming" : "non-streaming",
  );

  /* ---- build metadata object in a generic way ---- */
  const meta = {
    originalUrl: sanitize(url),
    cachedAt: new Date().toISOString(),
    isStreaming: wasStreaming.toString(),
    responseSize: responseSize,
  };

  // Store important response headers
  const importantHeaders = [
    "content-type",
    "content-encoding",
    "transfer-encoding",
    "vary",
    "cache-control",
  ];

  importantHeaders.forEach((h) => {
    const val = resp.headers.get(h);
    // Skip cache-control: no-cache header
    if (h === "cache-control" && val === "no-cache") {
      logMeta("Skipping cache-control: no-cache header in metadata");
      return;
    }
    if (val) {
      meta[`response_${h.replace(/-/g, "_")}`] = sanitize(val);
      logMeta("Added response header to metadata: %s = %s", h, val);
    }
  });

  // chosen request headers
  [
    "cf-connecting-ip",
    "x-forwarded-for",
    "user-agent",
    "referer",
    "referrer",
    "accept-language",
    "cf-ray",
  ].forEach((h) => {
    const val = req?.headers.get(h);
    if (val) {
      meta[h.replace(/-/g, "_")] = sanitize(val);
      logMeta("Added request header to metadata: %s", h);
    }
  });
  meta.method = req?.method;

  // flatten request.cf (primitives only)
  const cf = req?.cf || {};
  for (const [k, v] of Object.entries(cf)) {
    if (typeof v !== "object" || v === null) {
      meta[k] = sanitize(v);
      logMeta("Added CF property to metadata: %s", k);
    }
  }

  // stringify botManagement & detectionIds if present
  if (cf.botManagement) meta.botManagement = sanitize(cf.botManagement);
  if (cf.detectionIds) meta.detectionIds = sanitize(cf.detectionIds);

  logMeta("Metadata created with %d properties", Object.keys(meta).length);
  return { meta, contentType: ct, wasStreaming };
}

/**
 * Cache a streaming response in R2
 * Collects all chunks and uploads them as a single object
 */
export async function uploadStreamToR2(
  stream,
  bucket,
  key,
  resp,
  url = "",
  req = null,
) {
  logCache("Caching streaming response for key: %s", key);

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
        logCache(
          "Collected %d chunks, total size so far: %d bytes",
          chunks.length,
          totalSize,
        );
      }
    }

    // Combine all chunks into a single buffer
    logCache(
      "Combining %d chunks, total size: %d bytes",
      chunks.length,
      totalSize,
    );
    const combinedChunks = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combinedChunks.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Update metadata with final size
    meta.responseSize = totalSize;

    // Upload the combined buffer
    logCache("Uploading to R2, key: %s, size: %d bytes", key, totalSize);
    await bucket.put(key, combinedChunks, {
      httpMetadata: { contentType },
      customMetadata: meta,
    });

    logCache("Upload complete for key: %s", key);
    return { success: true, size: totalSize };
  } catch (error) {
    logCache("Error caching streaming response: %o", error);
    throw error; // Re-throw to be handled by the caller
  }
}

/** Store body + flexible metadata in R2 */
export async function cacheResponse(bucket, key, resp, url = "", req = null) {
  logCache("Caching response for key: %s", key);
  logCache("URL being cached: %s", url);

  try {
    const clone = resp.clone();
    const ct = clone.headers.get("content-type") || "";
    const wasStreaming = ct.startsWith("text/event-stream");

    logCache("Content type: %s, Streaming: %s", ct, wasStreaming);

    // Log headers at debug level
    logCache("Response headers:");
    for (const [name, value] of clone.headers.entries()) {
      logCache("  %s: %s", name, value);
    }

    // For non-streaming responses, use the traditional approach
    if (!wasStreaming) {
      const buf = await clone.arrayBuffer();
      logCache("Response size (bytes): %d", buf.byteLength);

      const { meta } = createMetadata(clone, url, req, buf.byteLength);

      logCache("Putting object in bucket with key: %s", key);
      await bucket.put(key, buf, {
        httpMetadata: { contentType: ct },
        customMetadata: meta,
      });
      logCache("Successfully cached response for key: %s", key);
    } else {
      // For streaming responses, we don't do anything here
      // The streaming upload is handled separately in the main handler
      logCache(
        "Streaming response detected - caching will be handled separately",
      );
    }

    return resp;
  } catch (error) {
    logCache("Error caching response: %o", error);
    throw error; // Re-throw to be handled by the caller
  }
}
