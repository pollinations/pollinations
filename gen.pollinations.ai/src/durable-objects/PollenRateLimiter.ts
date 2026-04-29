import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";

/**
 * PollenRateLimiter Durable Object (Ephemeral)
 *
 * Simplified pollen-based rate limiter:
 * - State: nextAllowedTime (single timestamp)
 * - Refill: automatic via time progression
 * - Cost: deducted post-request, determines next allowed time
 * - Formula: nextAllowedTime = now + (cost / refillRate)
 *
 * Design:
 * - Expensive requests = longer wait (natural punishment)
 * - Cheap requests = shorter wait (reward efficiency)
 * - Idle users get burst (time accumulates)
 * - No timeout: consumePollen(0) must be called for cache hits
 */
export class PollenRateLimiter extends DurableObject {
    private nextAllowedTime: number = 0;
    private readonly refillRate: number;
    private readonly log = getLogger(["durable", "rate-limiter"]);

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);

        const refillPerHour = env.POLLEN_REFILL_PER_HOUR ?? 1.0;
        this.refillRate = refillPerHour / 3600000;

        ctx.blockConcurrencyWhile(async () => {
            this.nextAllowedTime =
                (await ctx.storage.get("nextAllowedTime")) ?? 0;
            this.log.debug("Loaded state: nextAllowedTime={nextAllowedTime}", {
                nextAllowedTime: this.nextAllowedTime,
            });
        });
    }

    async checkRateLimit(): Promise<{
        allowed: boolean;
        waitMs?: number;
    }> {
        const now = Date.now();

        if (now >= this.nextAllowedTime) {
            this.log.debug("Request ALLOWED");
            return { allowed: true };
        }

        const waitMs = this.nextAllowedTime - now;
        this.log.info("Request BLOCKED - wait {waitMs}ms", { waitMs });

        return {
            allowed: false,
            waitMs,
        };
    }

    async consumePollen(cost: number): Promise<void> {
        const now = Date.now();
        const waitTime = Math.ceil(cost / this.refillRate);

        const MAX_BURST_MS = 10 * 3600000;
        const effectiveBase =
            this.nextAllowedTime === 0
                ? now
                : Math.max(now - MAX_BURST_MS, this.nextAllowedTime);
        this.nextAllowedTime = effectiveBase + waitTime;

        this.log.debug("Consumed {cost} pollen, next allowed in {waitMs}ms", {
            cost,
            waitMs: Math.max(0, this.nextAllowedTime - now),
        });

        await this.ctx.storage.put("nextAllowedTime", this.nextAllowedTime);
    }

    async getState(): Promise<{
        nextAllowedTime: number;
        msUntilAllowed: number;
    }> {
        const now = Date.now();
        return {
            nextAllowedTime: this.nextAllowedTime,
            msUntilAllowed: Math.max(0, this.nextAllowedTime - now),
        };
    }

    async reset(): Promise<void> {
        this.nextAllowedTime = 0;
        await this.ctx.storage.put("nextAllowedTime", 0);
    }
}
