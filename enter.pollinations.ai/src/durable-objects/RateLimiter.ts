import { DurableObject } from "cloudflare:workers";

/**
 * RateLimiter Durable Object (Ephemeral)
 * 
 * Implements a token bucket rate limiter with the following characteristics:
 * - Capacity: 3 tokens (allows bursts of up to 3 requests)
 * - Refill rate: 1 token per 15 seconds
 * - Strong consistency: All operations are atomic within the Durable Object
 * - Per-user isolation: Each user (identified by IP) gets their own Durable Object
 * - Ephemeral: Uses in-memory state only, no persistent storage
 * 
 * The token bucket algorithm works as follows:
 * 1. Start with a full bucket (3 tokens)
 * 2. Each request consumes 1 token
 * 3. Tokens refill at a rate of 1 per 15 seconds
 * 4. If no tokens available, request is rate limited
 * 
 * Benefits over KV-based approach:
 * - Strong consistency (no race conditions with parallel requests)
 * - Automatic token refilling via setTimeout
 * - Per-user state isolation
 * - No storage costs (ephemeral, in-memory only)
 * - Automatic cleanup (state resets when DO is evicted after inactivity)
 */
export class RateLimiter extends DurableObject {
    private tokens: number;
    private capacity: number = 3;
    private refillIntervalMs: number = 15000; // 15 seconds per token
    private refillTimer: ReturnType<typeof setTimeout> | null = null;
    
    constructor(ctx: DurableObjectState, env: unknown) {
        super(ctx, env);
        // Start with full capacity
        this.tokens = this.capacity;
    }
    
    /**
     * Check if a request should be allowed based on available tokens
     * @returns Object with allowed status, remaining tokens, and reset time
     */
    async checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const now = Date.now();
        
        if (this.tokens > 0) {
            this.tokens--;
            this.scheduleRefill();
            
            return {
                allowed: true,
                remaining: this.tokens,
                resetTime: now + this.refillIntervalMs,
            };
        }
        
        return {
            allowed: false,
            remaining: 0,
            resetTime: now + this.refillIntervalMs,
        };
    }
    
    /**
     * Schedule a token refill using setTimeout
     * Only schedules if no timer is currently active
     */
    private scheduleRefill(): void {
        if (this.refillTimer === null) {
            this.refillTimer = setTimeout(() => {
                this.refillToken();
            }, this.refillIntervalMs);
        }
    }
    
    /**
     * Refill one token and schedule the next refill if needed
     */
    private refillToken(): void {
        this.refillTimer = null;
        
        if (this.tokens < this.capacity) {
            this.tokens++;
            // Schedule next refill if we're still below capacity
            if (this.tokens < this.capacity) {
                this.scheduleRefill();
            }
        }
    }
    
    /**
     * Get current state (for debugging/testing)
     */
    async getState(): Promise<{ tokens: number; capacity: number }> {
        return {
            tokens: this.tokens,
            capacity: this.capacity,
        };
    }
    
    /**
     * Reset rate limiter to full capacity (for testing)
     */
    async reset(): Promise<void> {
        this.tokens = this.capacity;
        if (this.refillTimer !== null) {
            clearTimeout(this.refillTimer);
            this.refillTimer = null;
        }
    }
}
