import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";

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
    private currentFill!: number; // Initialized in blockConcurrencyWhile
    private lastUpdateTime!: number; // Initialized in blockConcurrencyWhile
    private readonly capacity: number;
    private readonly refillRate: number;
    private requestInProgress: boolean = false;
    private readonly log = getLogger(["durable", "rate-limiter"]);

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);

        // Read configuration from environment variables with fallbacks
        this.capacity = env.POLLEN_BUCKET_CAPACITY ?? 0.1; // Default: 0.1 pollen (~2 cheap requests burst)
        const refillPerHour = env.POLLEN_REFILL_PER_HOUR ?? 1.0; // Default: 1 pollen per hour
        this.refillRate = refillPerHour / 3600000; // Convert per-hour to per-millisecond

        // Load state from storage or initialize with defaults
        // blockConcurrencyWhile ensures no requests are delivered until initialization completes
        this.ctx.blockConcurrencyWhile(async () => {
            this.currentFill =
                (await ctx.storage.get("currentFill")) ?? this.capacity;
            this.lastUpdateTime =
                (await ctx.storage.get("lastUpdateTime")) ?? Date.now();
            this.requestInProgress = false; // Always start with no request in progress

            this.log.debug(
                "Loaded state from storage: {currentFill} pollen, capacity {capacity}",
                {
                    currentFill: this.currentFill,
                    lastUpdateTime: this.lastUpdateTime,
                    capacity: this.capacity,
                },
            );
        });
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

        this.log.debug("Checking rate limit: {currentFill}/{capacity} pollen", {
            currentFill: this.currentFill,
            capacity: this.capacity,
            refillRatePerHour: this.refillRate * 3600000,
            requestInProgress: this.requestInProgress,
        });

        // Refill bucket based on time elapsed
        await this.refillBucket(now);

        this.log.debug("After refill: {currentFill} pollen", {
            currentFill: this.currentFill,
        });

        // Block if another request is in progress (prevents parallel requests)
        if (this.requestInProgress) {
            this.log.debug(
                "Blocking concurrent request - another request in progress",
            );
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
            this.log.debug("Request ALLOWED - {remaining} pollen remaining", {
                remaining: this.currentFill,
            });
            return {
                allowed: true,
                remaining: this.currentFill,
            };
        }

        // Calculate wait time until bucket refills to positive (rate limit exhausted case)
        const pollenNeeded = -this.currentFill; // Need to get back to zero (same threshold as check)
        const msNeeded = Math.ceil(pollenNeeded / this.refillRate);

        this.log.info(
            "Request BLOCKED - rate limit exhausted: {currentFill} pollen, need {pollenNeeded}, retry after {waitMs}ms",
            {
                currentFill: this.currentFill,
                pollenNeeded,
                waitMs: msNeeded,
            },
        );

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

            this.log.debug(
                "Consuming {cost} pollen (before: {currentFillBefore})",
                {
                    cost,
                    currentFillBefore: this.currentFill,
                },
            );

            // Refill bucket based on time elapsed
            await this.refillBucket(now);

            // Deduct cost (can go negative, creating debt that must be repaid by refill)
            this.currentFill = this.currentFill - cost;

            this.log.debug("After consumption: {currentFillAfter} pollen", {
                currentFillAfter: this.currentFill,
            });

            // Persist state to storage
            await this.ctx.storage.put("currentFill", this.currentFill);
            await this.ctx.storage.put("lastUpdateTime", this.lastUpdateTime);
        } finally {
            // Always clear flag, even if consumption fails
            this.requestInProgress = false;
        }
    }

    /**
     * Refill bucket based on time elapsed since last update
     * @param now - Current timestamp in milliseconds
     */
    private async refillBucket(now: number): Promise<void> {
        const timePassed = now - this.lastUpdateTime;
        const pollenToAdd = timePassed * this.refillRate;

        this.log.debug(
            "Refilling bucket: +{pollenToAdd} pollen ({timePassed}ms elapsed)",
            {
                timePassed,
                pollenToAdd,
                currentFillBefore: this.currentFill,
                capacity: this.capacity,
            },
        );

        // Add refilled pollen, cap at capacity
        this.currentFill = Math.min(
            this.capacity,
            this.currentFill + pollenToAdd,
        );
        this.lastUpdateTime = now;

        // Persist updated lastUpdateTime to storage
        await this.ctx.storage.put("lastUpdateTime", this.lastUpdateTime);

        this.log.debug("After refill (capped): {currentFillAfter} pollen", {
            currentFillAfter: this.currentFill,
        });
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
        await this.refillBucket(now);

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
