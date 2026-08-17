import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CommunityModelRateLimiter } from "../src/durable-objects/CommunityModelRateLimiter.ts";

describe("CommunityModelRateLimiter", () => {
    it("enforces whole and fractional limits independently per object", async () => {
        const namespace = env.COMMUNITY_MODEL_RATE_LIMITER;
        const first = namespace.get(
            namespace.newUniqueId(),
        ) as DurableObjectStub<CommunityModelRateLimiter>;
        const second = namespace.get(
            namespace.newUniqueId(),
        ) as DurableObjectStub<CommunityModelRateLimiter>;

        await expect(first.check(2)).resolves.toEqual({ allowed: true });
        await expect(first.check(2)).resolves.toEqual({ allowed: true });
        await expect(first.check(2)).resolves.toMatchObject({ allowed: false });
        await expect(second.check(0.5)).resolves.toEqual({ allowed: true });
        const blocked = await second.check(0.5);
        expect(blocked).toMatchObject({ allowed: false });
        if (!blocked.allowed) {
            expect(blocked.retryAfterSeconds).toBeGreaterThan(60);
        }
    });
});
