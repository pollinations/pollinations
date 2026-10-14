import { DurableObject } from "cloudflare:workers";

const MINUTE_MS = 60_000;
// Avoid waking high-RPM buckets immediately after they refill.
const CLEANUP_GRACE_MS = 5 * MINUTE_MS;

type RateLimitState = {
    rpm: number;
    tokens: number;
    updatedAt: number;
};

/** One token bucket per model and Pollinations user. */
export class CommunityModelRateLimiter extends DurableObject {
    private state: RateLimitState | null = null;

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.state =
                (await ctx.storage.get<RateLimitState>("state")) ?? null;
        });
    }

    async check(
        limit: number,
    ): Promise<
        { allowed: true } | { allowed: false; retryAfterSeconds: number }
    > {
        const now = Date.now();
        const capacity = Math.max(1, limit);
        const previous = this.state;
        const limitChanged = previous !== null && previous.rpm !== limit;
        const state = previous
            ? {
                  rpm: limit,
                  tokens: Math.min(
                      capacity,
                      previous.tokens +
                          ((now - previous.updatedAt) * previous.rpm) /
                              MINUTE_MS,
                  ),
                  updatedAt: now,
              }
            : { rpm: limit, tokens: capacity, updatedAt: now };

        if (state.tokens < 1) {
            this.state = state;
            // Persist a changed rate even when this request is denied; otherwise
            // eviction could restore the old refill rate and grant tokens early.
            if (limitChanged) {
                await this.ctx.storage.put("state", state);
                await this.ctx.storage.setAlarm(
                    now +
                        ((capacity - state.tokens) * MINUTE_MS) / limit +
                        CLEANUP_GRACE_MS,
                );
            }
            return {
                allowed: false,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil(((1 - state.tokens) * MINUTE_MS) / limit / 1000),
                ),
            };
        }

        state.tokens -= 1;
        this.state = state;
        await this.ctx.storage.put("state", state);
        await this.ctx.storage.setAlarm(
            now +
                ((capacity - state.tokens) * MINUTE_MS) / limit +
                CLEANUP_GRACE_MS,
        );
        return { allowed: true };
    }

    async alarm(): Promise<void> {
        this.state = null;
        await this.ctx.storage.deleteAll();
    }
}
