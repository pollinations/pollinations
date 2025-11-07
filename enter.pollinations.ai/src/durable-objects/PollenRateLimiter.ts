import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.ts";

/**
 * PollenRateLimiter Durable Object (Ephemeral)
 * 
 * Implements a pollen-based token bucket rate limiter:
 * - Bucket holds pollen units (not request counts)
 * - Capacity: 0.1 pollen (allows ~2 average requests burst)
 * - Refill rate: 1/60 pollen per minute = 1 pollen per hour (steady-state throughput)
 * - Actual cost deducted post-request (no estimation needed)
 * - Identifier: pk_{apiKeyId}:ip:{ip} (prevents abuse via key+IP combination)
 * 
 * Design principles:
 * - Allows negative balance: Creates debt when costs exceed available pollen
 * - Continuous refill: Time-based, not fixed windows
 * - Uses actual pollen costs from completed requests
 * - Separate from user balance checks (polar middleware)
 * - Only applies to frontend keys (pk_*)
 */
export class PollenRateLimiter extends DurableObject {
    private currentFill: number;
    private lastUpdateTime: number;
    private readonly capacity: number;
    private readonly refillRate: number;
    private requestInProgress: boolean = false;
    
    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);
        
        // Read configuration from environment variables with fallbacks
        this.capacity = env.POLLEN_BUCKET_CAPACITY ?? 0.1;
        const refillPerHour = env.POLLEN_REFILL_PER_HOUR ?? 1.0;
        this.refillRate = refillPerHour / 3600000; // Convert per-hour to per-millisecond
        
        // Start with full capacity
        this.currentFill = this.capacity;
        this.lastUpdateTime = Date.now();
    }
    
    /**
     * Check if request should be allowed based on available pollen
     * Called BEFORE request is processed
     * 
     * @returns Object with allowed status, remaining pollen, and wait time if blocked
     */
    async checkRateLimit(): Promise<{ 
        allowed: boolean; 
        remaining: number; 
        waitMs?: number;
    }> {
        const now = Date.now();
        
        // Refill bucket based on time elapsed
        this.refillBucket(now);
        
        // Block if another request is in progress (prevents parallel requests)
        if (this.requestInProgress) {
            return {
                allowed: false,
                remaining: this.currentFill,
                // No waitMs - concurrent request, retry immediately
            };
        }
        
        // Allow request if bucket has positive pollen
        // Bucket can go negative after consumption, naturally blocking future requests
        if (this.currentFill > 0) {
            // Allow request and mark as in progress
            this.requestInProgress = true;
            return {
                allowed: true,
                remaining: this.currentFill,
            };
        }
        
        // Calculate wait time until bucket refills to positive (rate limit exhausted case)
        const pollenNeeded = -this.currentFill; // Need to get back to zero (same threshold as check)
        const msNeeded = Math.ceil(pollenNeeded / this.refillRate);
        
        return {
            allowed: false,
            remaining: this.currentFill,
            waitMs: msNeeded,
        };
    }
    
    /**
     * Record actual pollen consumption after request completes
     * Called AFTER request is processed (fire-and-forget)
     * 
     * @param cost - Actual pollen cost of the request
     */
    async consumePollen(cost: number): Promise<void> {
        try {
            const now = Date.now();
            
            // Refill bucket based on time elapsed
            this.refillBucket(now);
            
            // Deduct cost (can go negative, creating debt that must be repaid by refill)
            this.currentFill = this.currentFill - cost;
        } finally {
            // Always clear flag, even if consumption fails
            this.requestInProgress = false;
        }
    }
    
    /**
     * Refill bucket based on time elapsed since last update
     * @param now - Current timestamp in milliseconds
     */
    private refillBucket(now: number): void {
        const timePassed = now - this.lastUpdateTime;
        const pollenToAdd = timePassed * this.refillRate;
        
        // Add refilled pollen, cap at capacity
        this.currentFill = Math.min(this.capacity, this.currentFill + pollenToAdd);
        this.lastUpdateTime = now;
    }
    
    /**
     * Get current state (for debugging/testing)
     */
    async getState(): Promise<{ 
        currentFill: number; 
        capacity: number; 
        refillRate: number;
    }> {
        const now = Date.now();
        this.refillBucket(now);
        
        return {
            currentFill: this.currentFill,
            capacity: this.capacity,
            refillRate: this.refillRate * 3600000, // Convert to per-hour for readability
        };
    }
    
    /**
     * Reset rate limiter to full capacity (for testing)
     */
    async reset(): Promise<void> {
        this.currentFill = this.capacity;
        this.lastUpdateTime = Date.now();
    }
}
