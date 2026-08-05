import { env } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import type { AuthUser } from "@shared/auth/api-key.ts";
import {
    COMMUNITY_ENDPOINT_DEFAULT_RATE_LIMIT_RPM,
    COMMUNITY_ENDPOINT_PER_USER_RATE_LIMIT_SHARE,
    type CommunityEndpointRuntime,
    communityEndpointPerUserRateLimitRpm,
    communityEndpointPrices,
} from "@shared/community-endpoints.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { CommunityModelRateLimiter } from "@/durable-objects/CommunityModelRateLimiter.ts";
import type { Env } from "@/env.ts";
import { communityModelRateLimit } from "@/middleware/community-model-rate-limit.ts";

const testLog = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    getChild: () => testLog,
} as unknown as Logger;

function communityEndpoint(
    overrides: Partial<CommunityEndpointRuntime> = {},
): CommunityEndpointRuntime {
    return {
        id: "community-endpoint-id",
        ownerUserId: "owner-id",
        modelId: "test-owner/test-model",
        name: "test-model",
        title: "Test Model",
        description: null,
        modality: "text",
        imagePricing: "request",
        inputModalities: null,
        baseUrl: "https://community.example.test/v1",
        upstreamModel: "test-model",
        bearerTokenCiphertext: "encrypted",
        visibility: "public",
        delegatesGeneration: false,
        rateLimitRpm: null,
        fallbackModelIds: [],
        disabledAt: null,
        disabledReason: null,
        ...communityEndpointPrices({}),
        ...overrides,
    };
}

function user(id: string): AuthUser {
    return {
        id,
        email: `user-${id}@example.test`,
        tier: "free",
        isAdmin: false,
    } as unknown as AuthUser;
}

function createTestApp(options: {
    authUser?: AuthUser;
    community?: CommunityEndpointRuntime;
}) {
    const app = new Hono<Env>();

    app.use("*", async (c, next) => {
        c.set("log", testLog);
        c.set("auth", {
            user: options.authUser,
            requireAuthorization: async () => {},
            requireUser: () => {
                if (options.authUser) return options.authUser;
                throw new Error("no user in this test");
            },
            requireModelAccess: () => {},
        });
        c.set("model", {
            requested: "test-owner/test-model",
            resolved: "test-owner/test-model",
            definition: getRegistryModelDefinition("openai"),
            ...(options.community && {
                communityEndpoint: options.community,
            }),
        });
        await next();
    });
    app.post("/v1/chat/completions", communityModelRateLimit, (c) =>
        c.json({ ok: true }),
    );

    return app;
}

describe("communityEndpointPerUserRateLimitRpm", () => {
    it("derives 25% of the declared upstream RPM", () => {
        expect(
            communityEndpointPerUserRateLimitRpm({ rateLimitRpm: 100 }),
        ).toBe(25);
        expect(communityEndpointPerUserRateLimitRpm({ rateLimitRpm: 40 })).toBe(
            10,
        );
    });

    it("rounds up so a tiny share is never zero", () => {
        expect(communityEndpointPerUserRateLimitRpm({ rateLimitRpm: 1 })).toBe(
            1,
        );
        expect(communityEndpointPerUserRateLimitRpm({ rateLimitRpm: 3 })).toBe(
            1,
        );
    });

    it("falls back to the default RPM when the owner declared none", () => {
        const expected = Math.ceil(
            COMMUNITY_ENDPOINT_DEFAULT_RATE_LIMIT_RPM *
                COMMUNITY_ENDPOINT_PER_USER_RATE_LIMIT_SHARE,
        );
        expect(communityEndpointPerUserRateLimitRpm({})).toBe(expected);
        expect(
            communityEndpointPerUserRateLimitRpm({ rateLimitRpm: null }),
        ).toBe(expected);
        expect(communityEndpointPerUserRateLimitRpm({ rateLimitRpm: 0 })).toBe(
            expected,
        );
    });
});

describe("CommunityModelRateLimiter", () => {
    it("allows up to the limit then blocks with a retry window", async () => {
        const rateLimiter = env.COMMUNITY_MODEL_RATE_LIMITER;
        if (!rateLimiter) {
            throw new Error(
                "COMMUNITY_MODEL_RATE_LIMITER binding missing in test env",
            );
        }
        const id = rateLimiter.newUniqueId();
        const stub = rateLimiter.get(
            id,
        ) as DurableObjectStub<CommunityModelRateLimiter>;

        for (let i = 0; i < 3; i++) {
            const result = await stub.checkRateLimit(3);
            expect(result.allowed).toBe(true);
        }

        const blocked = await stub.checkRateLimit(3);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
    });
});

describe("communityModelRateLimit middleware", () => {
    it("passes through for non-community models", async () => {
        const app = createTestApp({ authUser: user("u1") });
        const response = await app.request(
            "/v1/chat/completions",
            { method: "POST" },
            env,
        );
        expect(response.status).toBe(200);
    });

    it("allows a community model call within the per-user budget", async () => {
        const app = createTestApp({
            authUser: user("u1"),
            community: communityEndpoint({ rateLimitRpm: 40 }),
        });
        const response = await app.request(
            "/v1/chat/completions",
            { method: "POST" },
            env,
        );
        expect(response.status).toBe(200);
    });

    it("rejects a community model call that exceeds the per-user budget", async () => {
        const app = createTestApp({
            authUser: user("u1"),
            community: communityEndpoint({ rateLimitRpm: 40 }),
        });
        // Per-user limit is 25% of 40 = 10; hammer the endpoint past it.
        let response = new Response();
        for (let i = 0; i < 11; i++) {
            response = await app.request(
                "/v1/chat/completions",
                { method: "POST" },
                env,
            );
        }
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBeTruthy();
        const body = (await response.json()) as {
            error: string;
            retryAfterSeconds: number;
        };
        expect(body.error).toBe("Rate limit exceeded");
        expect(body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("budgets callers independently", async () => {
        const appA = createTestApp({
            authUser: user("uA"),
            community: communityEndpoint({ rateLimitRpm: 40 }),
        });
        const appB = createTestApp({
            authUser: user("uB"),
            community: communityEndpoint({ rateLimitRpm: 40 }),
        });

        for (let i = 0; i < 10; i++) {
            await appA.request("/v1/chat/completions", { method: "POST" }, env);
        }
        const exhausted = await appA.request(
            "/v1/chat/completions",
            { method: "POST" },
            env,
        );
        expect(exhausted.status).toBe(429);

        const otherUser = await appB.request(
            "/v1/chat/completions",
            { method: "POST" },
            env,
        );
        expect(otherUser.status).toBe(200);
    });
});
