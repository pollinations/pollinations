import type { Store } from "hono-rate-limiter";

/**
 * Token Bucket rate limiter store for Cloudflare Workers KV
 * 
 * Implements a token bucket algorithm that provides smooth, continuous rate limiting:
 * - Tokens refill continuously at a fixed rate
 * - Max capacity prevents abuse
 * - No hard resets - users get tokens back gradually
 * - Much better UX than fixed window approach
 * 
 * KNOWN LIMITATION: Due to KV's eventually consistent nature, concurrent requests
 * from the same IP may not be perfectly rate limited. This is acceptable for most
 * real-world use cases where clients don't send many parallel requests.
 * 
 * For strict rate limiting, consider using Durable Objects instead:
 * https://developers.cloudflare.com/durable-objects/examples/build-a-rate-limiter/
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
        const prefixedKey = this.prefixKey(key);
        
        console.log(`[RATE_LIMIT] increment() called for key=${key}`);
        console.log(`[RATE_LIMIT]   prefixedKey=${prefixedKey}`);
        console.log(`[RATE_LIMIT]   now=${now}`);
        
        const stored = await this.namespace.get(prefixedKey, "json");
        console.log(`[RATE_LIMIT]   stored from KV:`, JSON.stringify(stored));
        
        let tokens: number;
        let lastRefill: number;
        
        if (stored && typeof stored === "object" && "tokens" in stored && "lastRefill" in stored) {
            // Existing bucket - refill tokens based on time elapsed
            const storedTokens = stored.tokens as number;
            const storedLastRefill = stored.lastRefill as number;
            const elapsedMs = now - storedLastRefill;
            const tokensToAdd = Math.floor(elapsedMs / this.refillRateMs);
            
            console.log(`[RATE_LIMIT]   existing bucket: storedTokens=${storedTokens}, elapsedMs=${elapsedMs}, tokensToAdd=${tokensToAdd}`);
            
            if (tokensToAdd > 0) {
                // Refill tokens (up to capacity) and update lastRefill
                tokens = Math.min(this.capacity, storedTokens + tokensToAdd);
                lastRefill = storedLastRefill + (tokensToAdd * this.refillRateMs);
                console.log(`[RATE_LIMIT]   refilled: tokens=${tokens}, lastRefill=${lastRefill}`);
            } else {
                // No refill yet
                tokens = storedTokens;
                lastRefill = storedLastRefill;
                console.log(`[RATE_LIMIT]   no refill: tokens=${tokens}`);
            }
        } else {
            // New bucket - start with full capacity
            tokens = this.capacity;
            lastRefill = now;
            console.log(`[RATE_LIMIT]   new bucket: tokens=${tokens}, lastRefill=${lastRefill}`);
        }
        
        // Calculate totalHits for hono-rate-limiter
        // hono-rate-limiter checks: if (totalHits > limit) return 429
        // When tokens=0, we need totalHits > capacity to trigger 429
        let totalHits: number;
        if (tokens > 0) {
            // We have tokens - calculate hits after consuming
            const tokensAfterConsume = tokens - 1;
            totalHits = this.capacity - tokensAfterConsume;
        } else {
            // No tokens available - return totalHits > capacity to trigger 429
            totalHits = this.capacity + 1;
        }
        
        console.log(`[RATE_LIMIT]   before consume: tokens=${tokens}, totalHits=${totalHits}, capacity=${this.capacity}`);
        console.log(`[RATE_LIMIT]   will be rate limited? ${totalHits > this.capacity ? 'YES (429)' : 'NO (200)'}`);
        
        // Only consume token if we have one
        if (tokens > 0) {
            tokens -= 1;
            console.log(`[RATE_LIMIT]   consumed token: tokens now=${tokens}`);
            
            // Store updated bucket state
            const ttlSeconds = Math.max(Math.ceil((this.capacity * this.refillRateMs) / 1000) + 10, 60);
            const newState = {
                tokens,
                lastRefill,
            };
            console.log(`[RATE_LIMIT]   writing to KV:`, JSON.stringify(newState));
            
            await this.namespace.put(
                prefixedKey,
                JSON.stringify(newState),
                { expirationTtl: ttlSeconds }
            );
            console.log(`[RATE_LIMIT]   KV write complete`);
        } else {
            console.log(`[RATE_LIMIT]   NO TOKENS AVAILABLE - should be rate limited!`);
        }
        
        const resetTime = new Date(lastRefill + this.refillRateMs);
        console.log(`[RATE_LIMIT]   returning: totalHits=${totalHits}, resetTime=${resetTime.toISOString()}`);
        
        return { totalHits, resetTime };
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
