import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.ts";

/**
 * PollenRateLimiter Durable Object (Ephemeral)
 * 
 * Implements a pollen-based token bucket rate limiter:
 * - Bucket holds pollen units (not request counts)
 * - Capacity: 0.15 pollen (allows ~3 average requests burst)
 * - Refill rate: 1/60 pollen per minute = 1 pollen per hour (steady-state throughput)
 * - Actual cost deducted post-request (no estimation needed)
 * - Identifier: pk_{apiKeyId}:ip:{ip} (prevents abuse via key+IP combination)
 * 
 * Design principles:
 * - No negative balance: Hard floor at zero
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
    
    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);
        
        // Read configuration from environment variables with fallbacks
        this.capacity = env.POLLEN_BUCKET_CAPACITY ?? 0.15;
        const refillPerMinute = env.POLLEN_REFILL_PER_MINUTE ?? 0.05;
        this.refillRate = refillPerMinute / 60000; // Convert per-minute to per-millisecond
        
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
        waitMs: number;
    }> {
        const now = Date.now();
        
        // Refill bucket based on time elapsed
        this.refillBucket(now);
        
        if (this.currentFill > 0) {
            // Allow request, remaining pollen stays for now (deducted post-request)
            return {
                allowed: true,
                remaining: this.currentFill,
                waitMs: 0,
            };
        }
        
        // Calculate wait time until bucket has at least 0.001 pollen
        const pollenNeeded = 0.001; // Minimum pollen to allow request
        const msNeeded = Math.ceil(pollenNeeded / this.refillRate);
        
        return {
            allowed: false,
            remaining: 0,
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
        const now = Date.now();
        
        // Refill bucket based on time elapsed
        this.refillBucket(now);
        
        // Deduct cost with hard floor at zero
        this.currentFill = Math.max(0, this.currentFill - cost);
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
            refillRate: this.refillRate * 60000, // Convert to per-minute for readability
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
