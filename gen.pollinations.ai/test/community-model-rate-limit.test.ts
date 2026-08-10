import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CommunityModelRateLimiter } from "../src/durable-objects/CommunityModelRateLimiter.ts";

describe("CommunityModelRateLimiter", () => {
    it("enforces the exact limit independently per object", async () => {
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
        await expect(second.check(2)).resolves.toEqual({ allowed: true });
    });
});
