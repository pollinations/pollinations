import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";

/**
 * CommunityModelRateLimiter Durable Object (Ephemeral)
 *
 * Per-caller rate limiter for community model calls. Community models route to
 * a single shared upstream credential per model, so without per-caller
 * isolation one heavy user can exhaust that upstream's quota and surface 502s
 * to every other user. One DO instance exists per caller + endpoint
 * (idFromName), tracking a fixed-window request count capped at the per-user
 * share of the endpoint's declared upstream RPM.
 *
 * Design:
 * - Fixed 60s window per instance; the window slides on first request after
 *   it has elapsed.
 * - Limit is passed per call (computed from the endpoint's rateLimitRpm), so
 *   an owner raising/lowering their declared RPM applies immediately without
 *   resetting stored state.
 * - No timeout: the caller must invoke checkRateLimit before proxying to the
 *   community endpoint.
 */
export class CommunityModelRateLimiter extends DurableObject {
    private count: number = 0;
    private windowStart: number = 0;
    private readonly log = getLogger([
        "durable",
        "community-model-rate-limiter",
    ]);

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);

        ctx.blockConcurrencyWhile(async () => {
            const stored = (await ctx.storage.get<{
                count: number;
                windowStart: number;
            }>("window")) ?? { count: 0, windowStart: 0 };
            this.count = stored.count;
            this.windowStart = stored.windowStart;
            this.log.debug(
                "Loaded state: count={count} windowStart={windowStart}",
                {
                    count: this.count,
                    windowStart: this.windowStart,
                },
            );
        });
    }

    async checkRateLimit(limit: number): Promise<{
        allowed: boolean;
        retryAfterMs?: number;
    }> {
        const now = Date.now();
        const windowMs = 60_000;

        if (now - this.windowStart >= windowMs) {
            this.windowStart = now;
            this.count = 0;
        }

        if (this.count >= limit) {
            const retryAfterMs = this.windowStart + windowMs - now;
            this.log.info(
                "Request BLOCKED, retry after {retryAfterMs}ms (limit {limit})",
                { retryAfterMs, limit },
            );
            return {
                allowed: false,
                retryAfterMs: Math.max(0, retryAfterMs),
            };
        }

        this.count++;
        this.log.debug("Request ALLOWED, count={count} limit={limit}", {
            count: this.count,
            limit,
        });
        await this.ctx.storage.put("window", {
            count: this.count,
            windowStart: this.windowStart,
        });

        return { allowed: true };
    }
}
