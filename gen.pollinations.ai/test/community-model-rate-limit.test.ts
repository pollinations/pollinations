import { env } from "cloudflare:test";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import {
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { CommunityModelRateLimiter } from "../src/durable-objects/CommunityModelRateLimiter.ts";
import type { Env } from "../src/env.ts";
import { enforceModelRateLimit } from "../src/utils/model-rate-limit.ts";

// Azure image deployments with a small quota cap each user at the deployment's
// own request limit instead of the 60 RPM floor.
const QUOTA_BOUND_MODELS = new Set([
    "gpt-image-2",
    "microsoft/mai-image-2.5-flash",
]);

describe("model rate limiting", () => {
    it("limits verified x402 payers without inventing a Pollinations user", async () => {
        let payer = crypto.randomUUID();
        const app = new Hono<Env>().get("/", async (c) => {
            c.set("auth", {
                paymentPayer: payer,
                requireUser: () => {
                    throw new Error("No Pollinations user");
                },
                requireModelAccess: () => {},
            });
            await enforceModelRateLimit(c, {
                id: "flux",
                definition: { ...IMAGE_SERVICES.flux, perUserRpm: 1 },
            });
            return c.text("allowed");
        });
        expect((await app.request("/", {}, env)).status).toBe(200);
        expect((await app.request("/", {}, env)).status).toBe(429);
        payer = crypto.randomUUID();
        expect((await app.request("/", {}, env)).status).toBe(200);
    });

    it("limits the self-hosted image models", () => {
        expect(IMAGE_SERVICES.flux.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.zimage.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.klein.perUserRpm).toBe(60);
        expect(IMAGE_SERVICES.dreamshaper.perUserRpm).toBe(300);
        expect(IMAGE_SERVICES["gpt-image-2"].perUserRpm).toBe(6);
        expect(IMAGE_SERVICES["gpt-image-2-openai"].perUserRpm).toBeNull();
        expect(IMAGE_SERVICES["microsoft/mai-image-2.5-flash"].perUserRpm).toBe(
            12,
        );
    });

    it("keeps other configured catalog model limits at 60 RPM or higher", () => {
        for (const model of getModels()) {
            const limit = getRegistryModelDefinition(model).perUserRpm;
            if (limit != null && !QUOTA_BOUND_MODELS.has(model)) {
                expect(limit).toBeGreaterThanOrEqual(60);
            }
        }
    });

    it("publishes a catalog model's configured per-user RPM", () => {
        const definition: ModelDefinition = {
            aliases: [],
            provider: "test",
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
