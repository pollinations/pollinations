import { DurableObject } from "cloudflare:workers";

const MINUTE_MS = 60_000;

type RateLimitState = {
    rpm: number;
    tokens: number;
    updatedAt: number;
};

/** One token bucket per community endpoint and Pollinations user. */
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
        const state =
            this.state?.rpm === limit
                ? {
                      ...this.state,
                      tokens: Math.min(
                          capacity,
                          this.state.tokens +
                              ((now - this.state.updatedAt) * limit) /
                                  MINUTE_MS,
                      ),
                      updatedAt: now,
                  }
                : { rpm: limit, tokens: capacity, updatedAt: now };

        if (state.tokens < 1) {
            this.state = state;
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
            now + ((capacity - state.tokens) * MINUTE_MS) / limit,
        );
        return { allowed: true };
    }

    async alarm(): Promise<void> {
        this.state = null;
        await this.ctx.storage.deleteAll();
    }
}
