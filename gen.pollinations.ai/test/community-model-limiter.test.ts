import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CommunityModelLimiter } from "@/durable-objects/CommunityModelLimiter.ts";

function limiterStub(): DurableObjectStub<CommunityModelLimiter> {
    const namespace = env.COMMUNITY_MODEL_LIMITER;
    const id = namespace.idFromName(crypto.randomUUID());
    return namespace.get(id) as DurableObjectStub<CommunityModelLimiter>;
}

describe("CommunityModelLimiter", () => {
    it("rejects excess leases and ignores stale releases", async () => {
        const stub = limiterStub();
        const first = await stub.acquire();
        expect(first.allowed).toBe(true);
        if (!first.allowed) throw new Error("expected the first lease");

        await expect(stub.acquire()).resolves.toEqual({ allowed: false });
        await stub.release("stale-lease-id");
        await expect(stub.acquire()).resolves.toEqual({ allowed: false });

        await stub.release(first.leaseId);
        expect((await stub.acquire()).allowed).toBe(true);
    });

    it("reclaims an expired lease with its alarm", async () => {
        const stub = limiterStub();
        expect((await stub.acquire(1)).allowed).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Miniflare may run an already-due alarm before the helper gets to it.
        await runDurableObjectAlarm(stub);
        expect((await stub.acquire()).allowed).toBe(true);
    });
});
