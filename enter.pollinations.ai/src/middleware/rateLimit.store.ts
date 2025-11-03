import type { Store } from "hono-rate-limiter";

/**
 * Token Bucket rate limiter store for Cloudflare Workers KV
 * 
 * Implements a token bucket algorithm that provides smooth, continuous rate limiting:
 * - Tokens refill continuously at a fixed rate
 * - Max capacity prevents abuse
 * - No hard resets - users get tokens back gradually
 * - Much better UX than fixed window approach
 */
export class TokenBucketKVStore implements Store {
    namespace: KVNamespace;
    prefix: string;
    
    // Token bucket configuration
    private readonly capacity: number;
    private readonly refillRateMs: number;

    constructor(options: { 
        namespace: KVNamespace; 
        prefix?: string;
        capacity?: number;
        refillRateMs?: number;
    }) {
        this.namespace = options.namespace;
        this.prefix = options.prefix ?? "hrl:";
        this.capacity = options.capacity ?? 3;
        this.refillRateMs = options.refillRateMs ?? 15000;
    }

    prefixKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    init(options: { windowMs: number }): void {
        // windowMs not used in token bucket - we use refillRateMs instead
    }

    async get(key: string): Promise<{ totalHits: number; resetTime: Date } | undefined> {
        const value = await this.namespace.get(this.prefixKey(key), "json");
        if (value && typeof value === "object" && "tokens" in value && "lastRefill" in value) {
            // Convert token bucket data to format expected by hono-rate-limiter
            const tokens = value.tokens as number;
            const lastRefill = value.lastRefill as number;
            
            return {
                totalHits: this.capacity - tokens, // Convert tokens to hits
                resetTime: new Date(lastRefill + this.refillRateMs),
            };
        }
        return undefined;
    }

    async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
        const now = Date.now();
        const stored = await this.namespace.get(this.prefixKey(key), "json");
        
        let tokens: number;
        let lastRefill: number;
        
        if (stored && typeof stored === "object" && "tokens" in stored && "lastRefill" in stored) {
            // Existing bucket - refill tokens based on time elapsed
            const storedTokens = stored.tokens as number;
            const storedLastRefill = stored.lastRefill as number;
            const elapsedMs = now - storedLastRefill;
            const tokensToAdd = Math.floor(elapsedMs / this.refillRateMs);
            
            if (tokensToAdd > 0) {
                // Refill tokens (up to capacity) and update lastRefill
                tokens = Math.min(this.capacity, storedTokens + tokensToAdd);
                lastRefill = storedLastRefill + (tokensToAdd * this.refillRateMs);
            } else {
                // No refill yet
                tokens = storedTokens;
                lastRefill = storedLastRefill;
            }
        } else {
            // New bucket - start with full capacity
            tokens = this.capacity;
            lastRefill = now;
        }
        
        // Check if we have tokens available BEFORE consuming
        // hono-rate-limiter will reject if totalHits >= limit
        const totalHits = this.capacity - tokens + 1; // +1 because this request will consume a token
        
        // Only consume token if we have one
        if (tokens > 0) {
            tokens -= 1;
            
            // Store updated bucket state
            const ttlSeconds = Math.max(Math.ceil((this.capacity * this.refillRateMs) / 1000) + 10, 60);
            await this.namespace.put(
                this.prefixKey(key),
                JSON.stringify({
                    tokens,
                    lastRefill,
                }),
                { expirationTtl: ttlSeconds }
            );
        }
        
        const resetTime = new Date(lastRefill + this.refillRateMs);
        return { totalHits: this.capacity - tokens, resetTime };
    }

    async decrement(key: string): Promise<void> {
        // Add a token back to the bucket
        const stored = await this.namespace.get(this.prefixKey(key), "json");
        if (stored && typeof stored === "object" && "tokens" in stored && "lastRefill" in stored) {
            const tokens = Math.min(this.capacity, (stored.tokens as number) + 1);
            const lastRefill = stored.lastRefill as number;
            
            const ttlSeconds = Math.max(Math.ceil((this.capacity * this.refillRateMs) / 1000) + 10, 60);
            await this.namespace.put(
                this.prefixKey(key),
                JSON.stringify({
                    tokens,
                    lastRefill,
                }),
                { expirationTtl: ttlSeconds }
            );
        }
    }

    async resetKey(key: string): Promise<void> {
        await this.namespace.delete(this.prefixKey(key));
    }
}
