import { DurableObject } from "cloudflare:workers";

const WINDOW_MS = 60_000;

type RateLimitWindow = {
    count: number;
    startedAt: number;
};

/** One fixed-window counter per community endpoint and Pollinations user. */
export class CommunityModelRateLimiter extends DurableObject {
    private window: RateLimitWindow = { count: 0, startedAt: 0 };

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.window =
                (await ctx.storage.get<RateLimitWindow>("window")) ??
                this.window;
        });
    }

    async check(
        limit: number,
    ): Promise<
        { allowed: true } | { allowed: false; retryAfterSeconds: number }
    > {
        const now = Date.now();
        const newWindow = now - this.window.startedAt >= WINDOW_MS;
        if (newWindow) this.window = { count: 0, startedAt: now };

        if (this.window.count >= limit) {
            return {
                allowed: false,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((this.window.startedAt + WINDOW_MS - now) / 1000),
                ),
            };
        }

        this.window.count += 1;
        await this.ctx.storage.put("window", this.window);
        if (newWindow) await this.ctx.storage.setAlarm(now + WINDOW_MS);
        return { allowed: true };
    }

    async alarm(): Promise<void> {
        this.window = { count: 0, startedAt: 0 };
        await this.ctx.storage.deleteAll();
    }
}
