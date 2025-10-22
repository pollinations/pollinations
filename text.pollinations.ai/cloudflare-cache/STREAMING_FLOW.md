# 🌊 Streaming Response Flow Diagram

## Non-Streaming Request Flow (Cached)

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /v1/chat/completions
       │ {"stream": false, ...}
       ▼
┌─────────────────────────────────┐
│   Exact Cache Middleware        │
│                                 │
│  1. Generate cache key          │
│  2. Check R2 for cached response│
└──────┬──────────────────────────┘
       │
       ├─ Cache HIT? ──────────────┐
       │                           │
       │ NO (MISS)                 │ YES (HIT)
       ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Proxy Origin   │         │  Return Cached  │
│                 │         │  Response       │
│  Forward to     │         │  X-Cache: HIT   │
│  text-origin    │         └─────────────────┘
└────────┬────────┘
         │
         │ Response from origin
         ▼
┌─────────────────────────────────┐
│  Response Received              │
│                                 │
│  1. Check if streaming          │
│     - Content-Type?             │
│     - Content-Length?           │
│                                 │
│  2. Is streaming? NO            │
│                                 │
│  3. Cache response in R2        │
│     (waitUntil background)      │
│                                 │
│  4. Return to client            │
│     X-Cache: MISS               │
└─────────────────────────────────┘
         │
         ▼
┌─────────────┐
│   Client    │
│  (receives  │
│  response)  │
└─────────────┘
```

---

## Streaming Request Flow (NOT Cached)

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /v1/chat/completions
       │ {"stream": true, ...}
       ▼
┌─────────────────────────────────┐
│   Exact Cache Middleware        │
│                                 │
│  1. Generate cache key          │
│  2. Check R2 for cached response│
└──────┬──────────────────────────┘
       │
       ├─ Cache HIT? ──────────────┐
       │                           │
       │ NO (MISS)                 │ YES (HIT) - Unlikely for streaming
       ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Proxy Origin   │         │  Return Cached  │
│                 │         │  Response       │
│  Forward to     │         │  X-Cache: HIT   │
│  text-origin    │         └─────────────────┘
└────────┬────────┘
         │
         │ Streaming response from origin
         │ Content-Type: text/event-stream
         ▼
┌─────────────────────────────────┐
│  Response Received              │
│                                 │
│  1. Check if streaming          │
│     ✓ Content-Type: text/event- │
│       stream                    │
│     ✓ No Content-Length         │
│                                 │
│  2. Is streaming? YES           │
│                                 │
│  3. ⚠️  SKIP CACHING            │
│     (return immediately)        │
│                                 │
│  4. Return stream to client     │
│     X-Cache: MISS               │
└─────────────────────────────────┘
         │
         │ Stream flows directly
         │ (no buffering)
         ▼
┌─────────────┐
│   Client    │
│  (receives  │
│  streaming  │
│  chunks)    │
└─────────────┘
```

---

## Detection Logic

```typescript
const isStreaming =
    contentType?.includes("text/event-stream") ||      // SSE
    contentType?.includes("application/x-ndjson") ||   // NDJSON
    !contentLength ||                                  // Chunked
    parseInt(contentLength) > 10 * 1024 * 1024;       // > 10MB
```

### Detection Criteria

| Condition | Reason | Example |
|-----------|--------|---------|
| `text/event-stream` | Server-Sent Events | Chat streaming |
| `application/x-ndjson` | Newline-delimited JSON | Streaming API |
| No `Content-Length` | Chunked transfer encoding | Dynamic content |
| `Content-Length > 10MB` | Large response | Big files |

---

## Cache Behavior Matrix

| Request Type | Content-Type | Content-Length | Cached? | Cache Header |
|--------------|--------------|----------------|---------|--------------|
| Non-streaming | `application/json` | `1234` | ✅ YES | `MISS` → `HIT` |
| Streaming SSE | `text/event-stream` | `null` | ❌ NO | Always `MISS` |
| Streaming NDJSON | `application/x-ndjson` | `null` | ❌ NO | Always `MISS` |
| Large response | `application/json` | `15728640` | ❌ NO | Always `MISS` |
| Chunked | `application/json` | `null` | ❌ NO | Always `MISS` |

---

## Performance Characteristics

### Non-Streaming (Cached)
```
First Request:  [Client] → [Cache MISS] → [Origin] → [Cache Store] → [Client]
                ├─ Latency: Origin response time + cache write (async)
                └─ Response: Full JSON object

Second Request: [Client] → [Cache HIT] → [Client]
                ├─ Latency: ~10-50ms (R2 read)
                └─ Response: Cached JSON object
```

### Streaming (NOT Cached)
```
Every Request:  [Client] → [Cache MISS] → [Origin] → [Stream] → [Client]
                ├─ Latency: Origin response time (no cache overhead)
                ├─ Response: Streaming chunks (SSE)
                └─ Cache: Skipped (no storage)
```

---

## Code Flow

### 1. Request Arrives
```typescript
// Generate cache key
let cacheKey = url.pathname + url.search;
if (request.method === "POST" || request.method === "PUT") {
    const body = await request.clone().text();
    const bodyHash = await hashBody(body);
    cacheKey = `${cacheKey}|${bodyHash}`;
}
```

### 2. Check Cache
```typescript
const cached = await c.env.TEXT_BUCKET.get(cacheKey);
if (cached) {
    return c.body(cached.body); // Cache HIT
}
```

### 3. Proxy to Origin
```typescript
await next(); // Calls proxy-origin middleware
```

### 4. Response Processing
```typescript
if (c.res?.ok && !(c.res.headers.get("x-cache") === "HIT")) {
    // Detect streaming
    const isStreaming = detectStreaming(c.res.headers);
    
    if (isStreaming) {
        console.log("[EXACT] Skipping cache for streaming response");
        return; // Don't cache
    }
    
    // Cache non-streaming response
    c.executionCtx.waitUntil(
        cacheResponse(cacheKey, c.res.clone())
    );
}
```

---

## Logging Examples

### Non-Streaming Request
```
[EXACT] Cache key: /v1/chat/completions|abc123...
[EXACT] Cache miss
[PROXY] Forwarding to origin: https://text-origin.pollinations.ai/v1/chat/completions
[EXACT] Caching response
[EXACT] Cached successfully
```

### Streaming Request
```
[EXACT] Cache key: /v1/chat/completions|def456...
[EXACT] Cache miss
[PROXY] Forwarding to origin: https://text-origin.pollinations.ai/v1/chat/completions
[EXACT] Skipping cache for streaming response (content-type: text/event-stream content-length: null)
```

---

## Summary

### ✅ What Works
- **Streaming passthrough:** Streams flow directly to client without blocking
- **Non-streaming cache:** Regular responses cached for fast subsequent requests
- **Automatic detection:** No client-side changes needed
- **Safe fallback:** If detection fails, worst case is no caching (not broken streaming)

### ⚠️ Limitations
- **Streaming not cached:** Each streaming request hits origin
- **10MB threshold:** Large non-streaming responses treated as streaming

### 🔮 Future Enhancement
- Implement TransformStream buffering to cache streaming responses
- Requires memory profiling and testing
- Not needed for initial production deployment
