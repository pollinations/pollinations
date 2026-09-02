import { env } from "cloudflare:test";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import {
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import type { CommunityModelRateLimiter } from "../src/durable-objects/CommunityModelRateLimiter.ts";

describe("model rate limiting", () => {
    it("limits the self-hosted image models", () => {
        expect(IMAGE_SERVICES.flux.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.zimage.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.klein.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.dreamshaper.perUserRpm).toBe(300);
    });

    it("keeps configured catalog model limits at 60 RPM or higher", () => {
        for (const model of getModels()) {
            const limit = getRegistryModelDefinition(model).perUserRpm;
            if (limit != null) expect(limit).toBeGreaterThanOrEqual(60);
        }
    });

    it("publishes a catalog model's configured per-user RPM", () => {
        const definition: ModelDefinition = {
            aliases: [],
            provider: "community",
            perUserRpm: 0.5,
            brand: "Test",
            category: "text",
            cost: {},
            priceMultiplier: 1,
            addedDate: 0,
            title: "Test",
        };

        expect(modelInfoFromDefinition("test", definition).per_user_rpm).toBe(
            0.5,
        );
    });

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

    it("does not refill an exhausted bucket when its limit changes", async () => {
        const stub = env.COMMUNITY_MODEL_RATE_LIMITER.get(
            env.COMMUNITY_MODEL_RATE_LIMITER.newUniqueId(),
        ) as DurableObjectStub<CommunityModelRateLimiter>;

        await expect(stub.check(2)).resolves.toEqual({ allowed: true });
        await expect(stub.check(2)).resolves.toEqual({ allowed: true });
        await expect(stub.check(1)).resolves.toMatchObject({ allowed: false });
    });
});
