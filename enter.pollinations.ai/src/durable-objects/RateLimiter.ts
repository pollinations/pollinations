import { DurableObject } from "cloudflare:workers";

/**
 * Rate Limiter Durable Object
 * 
 * Provides strongly consistent, per-user rate limiting using the token bucket algorithm.
 * Each user gets their own Durable Object instance, ensuring:
 * - No race conditions (strongly consistent)
 * - Fast in-memory state
 * - Automatic token refill via alarms
 * - Per-user isolation for better performance
 * 
 * Token Bucket Configuration:
 * - Capacity: 3 tokens
 * - Refill rate: 1 token every 15 seconds
 * - Allows bursts up to 3 requests
 * - Smooth, continuous rate limiting
 */
export class RateLimiter extends DurableObject {
    private tokens: number;
    private capacity: number = 3;
    private refillIntervalMs: number = 15000; // 15 seconds per token
    
    constructor(ctx: DurableObjectState, env: unknown) {
        super(ctx, env);
        // Start with full capacity
        this.tokens = this.capacity;
    }
    
    /**
     * Check if a request is allowed and consume a token if available
     * Returns: { allowed: boolean, remaining: number, resetTime: number }
     */
    async checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
        const now = Date.now();
        
        if (this.tokens > 0) {
            // Consume a token
            this.tokens--;
            
            // Schedule token refill if not already scheduled
            await this.scheduleRefill();
            
            return {
                allowed: true,
                remaining: this.tokens,
                resetTime: now + this.refillIntervalMs,
            };
        }
        
        // No tokens available
        return {
            allowed: false,
            remaining: 0,
            resetTime: now + this.refillIntervalMs,
        };
    }
    
    /**
     * Schedule an alarm to refill tokens
     */
    private async scheduleRefill(): Promise<void> {
        const currentAlarm = await this.ctx.storage.getAlarm();
        
        // Only schedule if no alarm is set
        if (currentAlarm === null) {
            await this.ctx.storage.setAlarm(Date.now() + this.refillIntervalMs);
        }
    }
    
    /**
     * Alarm handler - called when it's time to refill a token
     */
    async alarm(): Promise<void> {
        if (this.tokens < this.capacity) {
            // Add one token
            this.tokens++;
            
            // Schedule next refill if still below capacity
            if (this.tokens < this.capacity) {
                await this.scheduleRefill();
            }
        }
    }
    
    /**
     * Get current state (for debugging)
     */
    async getState(): Promise<{ tokens: number; capacity: number }> {
        return {
            tokens: this.tokens,
            capacity: this.capacity,
        };
    }
    
    /**
     * Reset rate limit (for testing)
     */
    async reset(): Promise<void> {
        this.tokens = this.capacity;
        await this.ctx.storage.deleteAlarm();
    }
}
