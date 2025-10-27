# IP-Based Rate Limiting for Frontend API Keys

## Current Status

### ✅ What's Implemented
- Frontend API keys (`pk_` prefix) that are safe to expose in client-side code
- Server API keys (`sk_` prefix) for backend applications
- Per-API-key rate limiting (5 requests per second per key)
- IP extraction from `cf-connecting-ip` header

### ❌ What's Missing
**IP-based rate limiting for frontend keys is NOT implemented yet.**

The documentation promises "IP-based rate limiting (100 req/min)" for frontend keys, but currently:
- All keys use the same per-key rate limiting (5 req/sec)
- No IP tracking or IP-based limits exist
- Frontend keys behave identically to server keys in terms of rate limiting

## Problem Analysis

### Current Rate Limiting
Located in `src/auth.ts`:
```typescript
rateLimit: {
    enabled: true,
    timeWindow: 1000, // 1 second
    maxRequests: 5, // 5 requests per key
}
```

This is **per-API-key** rate limiting, not per-IP.

### Why IP-Based Rate Limiting is Needed

Frontend keys are meant to be exposed in client-side code (React, Vue, etc.). Without IP-based rate limiting:

1. **Single key abuse**: One frontend key could be used by unlimited IPs
2. **No protection**: A malicious user could copy the key and spam from multiple IPs
3. **Cost control**: Can't limit per-user usage when key is shared

With IP-based rate limiting:
- Each IP address gets its own rate limit (e.g., 100 req/min)
- Same key can be used by many users, each with their own limit
- Prevents single IP from abusing the service

## Recommended Solution

### Option 1: Cloudflare Rate Limiting Binding (Recommended ⭐)

**Pros:**
- Native Cloudflare Workers feature
- No database overhead
- Highly performant (edge-based)
- Simple configuration
- Automatic cleanup of old entries

**Cons:**
- Requires Cloudflare Workers Paid plan ($5/month minimum)
- Less flexible than custom implementation

**Implementation:**

1. **Add Rate Limiting binding to `wrangler.toml`:**

```toml
# Add to all environments (development, staging, production)
[[rate_limit]]
binding = "RATE_LIMITER"
# Simple mode - just counts requests
simple = { limit = 100, period = 60 }
```

2. **Update TypeScript types in `worker-configuration.d.ts`:**

```typescript
interface Env {
    // ... existing bindings
    RATE_LIMITER: RateLimit;
}
```

3. **Implement IP-based rate limiting in `src/middleware/auth.ts`:**

```typescript
const authenticateApiKey = async (): Promise<AuthResult | null> => {
    if (!options.allowApiKey) return null;
    const apiKey = extractApiKey(c.req.raw.headers);
    if (!apiKey) return null;
    
    const keyResult = await client.api.verifyApiKey({
        body: { key: apiKey },
    });
    if (!keyResult.valid || !keyResult.key) return null;
    
    // Check if this is a frontend key (pk_ prefix)
    const isFrontendKey = keyResult.key.metadata?.keyType === "frontend";
    
    if (isFrontendKey) {
        // Apply IP-based rate limiting for frontend keys
        const clientIP = c.req.header("cf-connecting-ip") || "unknown";
        const rateLimitKey = `frontend:${apiKey}:${clientIP}`;
        
        const { success } = await c.env.RATE_LIMITER.limit({ 
            key: rateLimitKey 
        });
        
        if (!success) {
            throw new HTTPException(429, {
                message: "Rate limit exceeded. Frontend keys are limited to 100 requests per minute per IP address."
            });
        }
    }
    
    // ... rest of the function
};
```

### Option 2: Custom KV-Based Rate Limiting

**Pros:**
- Works on free tier
- More flexible (can customize limits per key)
- Full control over implementation

**Cons:**
- More code to maintain
- KV operations have latency
- Need to handle cleanup of old entries
- More complex implementation

**Implementation:**

1. **Create rate limiting utility `src/utils/ipRateLimit.ts`:**

```typescript
import { HTTPException } from "hono/http-exception";

interface RateLimitConfig {
    maxRequests: number;
    windowSeconds: number;
}

export async function checkIPRateLimit(
    kv: KVNamespace,
    apiKey: string,
    clientIP: string,
    config: RateLimitConfig
): Promise<void> {
    const key = `ratelimit:${apiKey}:${clientIP}`;
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);
    
    // Get current request timestamps
    const data = await kv.get(key, "json") as number[] | null;
    const requests = data || [];
    
    // Filter out requests outside the time window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (recentRequests.length >= config.maxRequests) {
        throw new HTTPException(429, {
            message: `Rate limit exceeded. Frontend keys are limited to ${config.maxRequests} requests per ${config.windowSeconds} seconds per IP address.`
        });
    }
    
    // Add current request
    recentRequests.push(now);
    
    // Store with TTL (cleanup old entries)
    await kv.put(
        key, 
        JSON.stringify(recentRequests),
        { expirationTtl: config.windowSeconds * 2 }
    );
}
```

2. **Use in `src/middleware/auth.ts`:**

```typescript
import { checkIPRateLimit } from "@/utils/ipRateLimit.ts";

const authenticateApiKey = async (): Promise<AuthResult | null> => {
    // ... existing code ...
    
    const isFrontendKey = keyResult.key.metadata?.keyType === "frontend";
    
    if (isFrontendKey) {
        const clientIP = c.req.header("cf-connecting-ip") || "unknown";
        await checkIPRateLimit(c.env.KV, apiKey, clientIP, {
            maxRequests: 100,
            windowSeconds: 60
        });
    }
    
    // ... rest of the function
};
```

## Comparison

| Feature | Cloudflare Rate Limiting | Custom KV-Based |
|---------|-------------------------|-----------------|
| **Cost** | Requires paid plan ($5/mo) | Works on free tier |
| **Performance** | Fastest (edge-based) | Slower (KV latency) |
| **Complexity** | Simple config | More code to maintain |
| **Flexibility** | Fixed limits | Fully customizable |
| **Cleanup** | Automatic | Manual (TTL-based) |
| **Recommended** | ✅ Production use | ✅ Development/testing |

## Implementation Steps

### Phase 1: Choose Approach
- [ ] Decide between Cloudflare Rate Limiting (Option 1) or Custom KV (Option 2)
- [ ] Check Cloudflare plan requirements

### Phase 2: Implement Rate Limiting
- [ ] Add rate limiting binding/utility
- [ ] Update auth middleware to check IP limits for frontend keys
- [ ] Add proper error messages (429 status)

### Phase 3: Testing
- [ ] Test with frontend key from single IP (should work)
- [ ] Test with frontend key from multiple IPs (each should have own limit)
- [ ] Test rate limit enforcement (should get 429 after limit)
- [ ] Test server keys are NOT affected (should use user-based limits)

### Phase 4: Documentation
- [ ] Update API_AUTHENTICATION.md with accurate rate limit info
- [ ] Add examples of handling 429 errors
- [ ] Document rate limit headers (if exposing remaining requests)

## Configuration Recommendations

### Rate Limits by Key Type

| Key Type | Limit Type | Limit | Window |
|----------|-----------|-------|--------|
| **Anonymous** | IP-based | 20 req/min | Per IP |
| **Frontend Key** | IP-based | 100 req/min | Per IP per key |
| **Server Key** | User-based | 1000 req/min | Per user |

### Environment-Specific Limits

```typescript
const RATE_LIMITS = {
    development: { maxRequests: 1000, windowSeconds: 60 }, // Generous for testing
    staging: { maxRequests: 100, windowSeconds: 60 },
    production: { maxRequests: 100, windowSeconds: 60 }
};
```

## Security Considerations

1. **IP Spoofing**: Use `cf-connecting-ip` (Cloudflare's trusted header), not `x-forwarded-for`
2. **Key Rotation**: Allow users to rotate frontend keys if compromised
3. **Monitoring**: Track rate limit hits to detect abuse
4. **Gradual Rollout**: Start with high limits, reduce based on usage patterns

## Next Steps

1. **Immediate**: Choose implementation approach (Option 1 or 2)
2. **Short-term**: Implement IP-based rate limiting for frontend keys
3. **Medium-term**: Add rate limit monitoring and analytics
4. **Long-term**: Consider per-model rate limits or dynamic limits based on tier
