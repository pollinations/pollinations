import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { AuthUser } from "@shared/auth/api-key.ts";
import {
    COMMUNITY_MODEL_REWARD_RATE,
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
} from "@shared/community-endpoints.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { track } from "@/middleware/track.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function createTestApp(
    consumePollen: (amount: number) => Promise<void>,
    user?: AuthUser,
    model: ModelVariables["model"] = {
        requested: "openai",
        resolved: "openai",
        definition: getRegistryModelDefinition("openai"),
    },
) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user,
            requireAuthorization: async () => {},
            requireUser: () => {
                if (user) return user;
                throw new Error("user should not be required in this test");
            },
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({
                tierBalance: 1,
                packBalance: 0,
            }),
        });
        c.set("frontendKeyRateLimit", { consumePollen });
        c.set("model", model);
        await next();
    });
    app.post(
        "/v1/chat/completions",
        track("generate.text"),
        () =>
            new Response(
                JSON.stringify({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                }),
                {
                    headers: {
                        "content-type": "application/json",
                        "x-model-used": "gpt-5-nano-2025-08-07",
                        "x-usage-prompt-text-tokens": "1000",
                        "x-usage-completion-text-tokens": "500",
                    },
                },
            ),
    );

    return app;
}

function createCommunityEndpoint(
    ownerUserId: string,
): CommunityEndpointRuntime {
    return {
        id: "community-endpoint-test",
        ownerUserId,
        modelId: "test-owner/test-model",
        name: "test-model",
        description: null,
        modality: "text",
        baseUrl: "https://community.example.test/openai",
        upstreamModel: "upstream-test-model",
        bearerTokenCiphertext: "encrypted",
        disabledAt: null,
        disabledReason: null,
        ...communityEndpointPrices({
            promptTextPrice: 0.0001,
            completionTextPrice: 0.0002,
        }),
    };
}

// App that returns a wrong content-type for the given event type, exercising
// the not-billed content-type guards in trackResponse.
function createWrongContentTypeApp(
    consumePollen: (amount: number) => Promise<void>,
    eventType: "generate.image" | "generate.text",
    response: Response,
) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: undefined,
            requireAuthorization: async () => {},
            requireUser: () => {
                throw new Error("user should not be required in this test");
            },
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 1, packBalance: 0 }),
        });
        c.set("frontendKeyRateLimit", { consumePollen });
        c.set("model", {
            requested: "openai",
            resolved: "openai",
            definition: getRegistryModelDefinition("openai"),
        });
        await next();
    });
    app.all("/upstream", track(eventType), () => response.clone());

    return app;
}

// App whose text response carries caller-supplied headers, used to assert that
// the x-fallback-target worker header propagates into the Tinybird event.
function createHeaderApp(extraHeaders: Record<string, string>) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: undefined,
            requireAuthorization: async () => {},
            requireUser: () => {
                throw new Error("user should not be required in this test");
            },
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 1, packBalance: 0 }),
        });
        c.set("frontendKeyRateLimit", { consumePollen: async () => {} });
        c.set("model", {
            requested: "openai",
            resolved: "openai",
            definition: getRegistryModelDefinition("openai"),
        });
        await next();
    });
    app.post(
        "/v1/chat/completions",
        track("generate.text"),
        () =>
            new Response(JSON.stringify({ choices: [{ message: {} }] }), {
                headers: {
                    "content-type": "application/json",
                    "x-model-used": "gpt-5-nano-2025-08-07",
                    "x-usage-prompt-text-tokens": "10",
                    "x-usage-completion-text-tokens": "5",
                    ...extraHeaders,
                },
            }),
    );

    return app;
}

async function captureFallbackEvent(extraHeaders: Record<string, string>) {
    const tinybirdRequests: Request[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        tinybirdRequests.push(new Request(input, init));
        return new Response("ok");
    });

    const ctx = createExecutionContext();
    await createHeaderApp(extraHeaders).fetch(
        new Request("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                model: "openai",
                stream: false,
                messages: [{ role: "user", content: "test" }],
            }),
        }),
        {
            ENVIRONMENT: "test",
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
            BETTER_AUTH_SECRET: "test_secret",
            TINYBIRD_INGEST_URL:
                "https://tinybird.test/v0/events?name=generation_event",
            TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
        } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(tinybirdRequests).toHaveLength(1);
    return (await tinybirdRequests[0].json()) as { fallbackUsed?: boolean };
}

describe("tracking observability", () => {
    it("emits Tinybird generation events for successful gen requests", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        const ctx = createExecutionContext();
        const response = await createTestApp(consumePollen).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "cf-connecting-ip": "203.0.113.42",
                    referer: "https://example.com/app",
                },
                body: JSON.stringify({
                    model: "openai",
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        expect(tinybirdRequests[0].url).toBe(
            "https://tinybird.test/v0/events?name=generation_event",
        );
        expect(tinybirdRequests[0].headers.get("authorization")).toBe(
            "Bearer test_tinybird_token",
        );
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            requestPath: "/v1/chat/completions",
            environment: "test",
            eventType: "generate.text",
            responseStatus: 200,
            modelRequested: "openai",
            resolvedModelRequested: "openai",
            modelUsed: "gpt-5-nano-2025-08-07",
            modelProviderUsed: expect.any(String),
            isBilledUsage: true,
            tokenCountPromptText: 1000,
            tokenCountCompletionText: 500,
            referrerUrl: "https://example.com/app",
            referrerDomain: "example.com",
            ipSubnet: "203.0.113.0",
        });
        expect(consumePollen).toHaveBeenCalledWith(expect.any(Number));
        expect(consumePollen.mock.calls[0]?.[0]).toBeGreaterThan(0);
    });

    it("does not trigger auto top-up while post-deduction pack balance is above threshold", async () => {
        const db = drizzle(env.DB);
        const userId = `track-auto-top-up-${crypto.randomUUID()}`;
        await db.insert(userTable).values({
            id: userId,
            email: `${userId}@test.local`,
            name: "Track Auto Top Up Test",
            tier: "flower",
            tierBalance: 0,
            packBalance: 100,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const [user] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);
        if (!user) throw new Error("Expected inserted user");

        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        const enterFetch = vi.fn<typeof env.ENTER.fetch>(async () =>
            Response.json({ status: "created" }),
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        const ctx = createExecutionContext();
        const response = await createTestApp(consumePollen, user).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "cf-connecting-ip": "203.0.113.42",
                },
                body: JSON.stringify({
                    model: "openai",
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                ...env,
                ENTER: { fetch: enterFetch },
                ENVIRONMENT: "test",
                PLN_ENTER_TOKEN:
                    "test_internal_token_with_enough_length_for_checks",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as unknown as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(enterFetch).not.toHaveBeenCalled();
    });

    it("emits the credited community model reward amount", async () => {
        const db = drizzle(env.DB);
        const payerId = `track-community-payer-${crypto.randomUUID()}`;
        const ownerId = `track-community-owner-${crypto.randomUUID()}`;
        await db.insert(userTable).values([
            {
                id: payerId,
                email: `${payerId}@test.local`,
                name: "Track Community Payer",
                tier: "flower",
                tierBalance: 1,
                packBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: ownerId,
                email: `${ownerId}@test.local`,
                name: "Track Community Owner",
                tier: "flower",
                tierBalance: 0,
                packBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);
        const [payer] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, payerId))
            .limit(1);
        if (!payer) throw new Error("Expected inserted payer");

        const endpoint = createCommunityEndpoint(ownerId);
        const model: ModelVariables["model"] = {
            requested: endpoint.modelId,
            resolved: endpoint.modelId,
            definition: communityModelDefinition(endpoint),
            communityEndpoint: endpoint,
        };

        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        const ctx = createExecutionContext();
        const response = await createTestApp(consumePollen, payer, model).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: endpoint.modelId,
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                ...env,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as unknown as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        const event = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(event).toMatchObject({
            resolvedModelRequested: endpoint.modelId,
            communityModelRewardUserId: ownerId,
            communityModelRewardRate: COMMUNITY_MODEL_REWARD_RATE,
            communityModelRewardAmount: 0.15,
            devPrice: 0.2,
            totalPrice: 0.2,
        });
        expect(event).not.toHaveProperty("communityModelRewardModelId");

        const [owner] = await db
            .select({ tierBalance: userTable.tierBalance })
            .from(userTable)
            .where(eq(userTable.id, ownerId))
            .limit(1);
        expect(owner?.tierBalance).toBeCloseTo(0.15, 10);
    });

    it("does not bill image generation that returns a JSON (non-image) content-type", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        // Upstream returned a JSON error body with HTTP 200 instead of an image.
        const upstream = new Response(JSON.stringify({ error: "boom" }), {
            headers: { "content-type": "application/json" },
        });

        const ctx = createExecutionContext();
        const response = await createWrongContentTypeApp(
            consumePollen,
            "generate.image",
            upstream,
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "GET",
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            eventType: "generate.image",
            responseStatus: 200,
            isBilledUsage: false,
        });
        expect(consumePollen).toHaveBeenCalledWith(0);
    });

    it("bills 3D generation that returns a model/ content-type", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        // 3D models share the "generate.image" EventType but respond with a
        // model/* content-type (e.g. model/gltf-binary), not image/ or video/.
        const upstream = new Response(new Uint8Array([1, 2, 3]), {
            headers: {
                "content-type": "model/gltf-binary",
                "x-model-used": "triposr",
                "x-usage-completion-image-tokens": "1",
            },
        });

        const ctx = createExecutionContext();
        const response = await createWrongContentTypeApp(
            consumePollen,
            "generate.image",
            upstream,
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "GET",
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            eventType: "generate.image",
            responseStatus: 200,
            isBilledUsage: true,
        });
    });

    it("does not bill a streamed text request that returns a non-SSE content-type", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn<(amount: number) => Promise<void>>(
            async () => {},
        );

        // stream: true was requested but upstream returned JSON, not SSE.
        const upstream = new Response(JSON.stringify({ error: "boom" }), {
            headers: {
                "content-type": "application/json",
                "x-model-used": "gpt-5-nano-2025-08-07",
                "x-usage-prompt-text-tokens": "1000",
                "x-usage-completion-text-tokens": "500",
            },
        });

        const ctx = createExecutionContext();
        const response = await createWrongContentTypeApp(
            consumePollen,
            "generate.text",
            upstream,
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai",
                    stream: true,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            eventType: "generate.text",
            responseStatus: 200,
            isBilledUsage: false,
        });
        expect(consumePollen).toHaveBeenCalledWith(0);
    });

    it("records fallbackUsed=true when Portkey served a non-primary target", async () => {
        const event = await captureFallbackEvent({
            "x-fallback-target": "config.targets[1]",
        });
        expect(event.fallbackUsed).toBe(true);
    });

    it("records fallbackUsed=false when Portkey served the primary target", async () => {
        const event = await captureFallbackEvent({
            "x-fallback-target": "config.targets[0]",
        });
        expect(event.fallbackUsed).toBe(false);
    });

    it("records fallbackUsed=false when no fallback header is present", async () => {
        const event = await captureFallbackEvent({});
        expect(event.fallbackUsed).toBe(false);
    });
});
