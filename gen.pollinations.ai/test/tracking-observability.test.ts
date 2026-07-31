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
import {
    type BillingAdjustment,
    getPriceDefinitionForModel,
    getRegistryModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";
import { removeUnset } from "@shared/util.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import {
    reduceAdjustmentsToEventFields,
    track,
    trackResponse,
} from "@/middleware/track.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

let trackingUser: AuthUser;

function createTestApp(
    consumePollen: (amount: number) => Promise<void>,
    user: AuthUser | undefined = trackingUser,
    model: ModelVariables["model"] = {
        requested: "openai",
        resolved: "openai",
        definition: getRegistryModelDefinition("openai"),
    },
    responseHeaders: Record<string, string> = {},
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
                        ...responseHeaders,
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
        title: "Test Model",
        description: null,
        delegatesGeneration: false,
        modality: "text",
        imagePricing: "request",
        supportsImageEdits: false,
        baseUrl: "https://community.example.test/openai",
        upstreamModel: "upstream-test-model",
        bearerTokenCiphertext: "encrypted",
        visibility: "public",
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
    eventType: "generate.image" | "generate.text" | "generate.audio",
    response: Response,
    model: ModelName = "openai",
) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: trackingUser,
            requireAuthorization: async () => {},
            requireUser: () => trackingUser,
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 1, packBalance: 0 }),
        });
        c.set("frontendKeyRateLimit", { consumePollen });
        c.set("model", {
            requested: model,
            resolved: model,
            definition: getRegistryModelDefinition(model),
        });
        await next();
    });
    app.all("/upstream", track(eventType), () => response.clone());

    return app;
}

// App that streams an SSE completion whose chunks arrive with real delays,
// used to assert that endTime/responseTime cover the whole stream duration
// rather than just time-to-first-byte.
function createSseStreamApp(
    chunkDelayMs: number,
    modelName: ModelName = "openai",
    providerReportedCost?: number,
) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: trackingUser,
            requireAuthorization: async () => {},
            requireUser: () => trackingUser,
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 1, packBalance: 0 }),
        });
        c.set("frontendKeyRateLimit", { consumePollen: async () => {} });
        c.set("model", {
            requested: modelName,
            resolved: modelName,
            definition: getRegistryModelDefinition(modelName),
        });
        await next();
    });
    app.post("/v1/chat/completions", track("generate.text"), () => {
        const encoder = new TextEncoder();
        const sse = (data: object) => `data: ${JSON.stringify(data)}\n\n`;
        const chunks = [
            sse({
                model: "gpt-5-nano-2025-08-07",
                choices: [{ delta: { content: "hel" } }],
            }),
            sse({
                model: "gpt-5-nano-2025-08-07",
                choices: [{ delta: { content: "lo" } }],
            }),
            sse({
                model: "gpt-5-nano-2025-08-07",
                choices: [],
                usage: {
                    prompt_tokens: 1000,
                    completion_tokens: 500,
                    total_tokens: 1500,
                    ...(providerReportedCost === undefined
                        ? {}
                        : { cost: providerReportedCost }),
                },
            }),
            "data: [DONE]\n\n",
        ];
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                for (const chunk of chunks) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, chunkDelayMs),
                    );
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            },
        });
        return new Response(body, {
            headers: { "content-type": "text/event-stream" },
        });
    });

    return app;
}

// App whose text response carries caller-supplied headers, used to assert that
// the x-fallback-target worker header propagates into the Tinybird event.
function createHeaderApp(
    extraHeaders: Record<string, string>,
    user: AuthUser | null = trackingUser,
    status = 200,
    consumePollen: (amount: number) => Promise<void> = async () => {},
    model: ModelName = "openai",
) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            user: user ?? undefined,
            requireAuthorization: async () => {},
            requireUser: () => {
                if (user) return user;
                throw new Error("user should not be required in this test");
            },
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 1, packBalance: 0 }),
        });
        c.set("frontendKeyRateLimit", { consumePollen });
        c.set("model", {
            requested: model,
            resolved: model,
            definition: getRegistryModelDefinition(model),
        });
        await next();
    });
    app.post(
        "/v1/chat/completions",
        track("generate.text"),
        () =>
            new Response(JSON.stringify({ choices: [{ message: {} }] }), {
                status,
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
            DB: env.DB,
            ENVIRONMENT: "test",
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
            BETTER_AUTH_SECRET: "test_secret",
            TINYBIRD_INGEST_URL:
                "https://tinybird.test/v0/events?name=generation_event_v2",
            TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
        } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(tinybirdRequests).toHaveLength(1);
    return (await tinybirdRequests[0].json()) as { fallbackUsed?: boolean };
}

describe("tracking observability", () => {
    beforeEach(async () => {
        const db = drizzle(env.DB);
        const userId = `tracking-observability-${crypto.randomUUID()}`;
        await db.insert(userTable).values({
            id: userId,
            email: `${userId}@test.local`,
            name: "Tracking Observability Test",
            tierBalance: 10_000,
            packBalance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const [user] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);
        if (!user) throw new Error("Expected inserted tracking user");
        trackingUser = user;
    });

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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        expect(tinybirdRequests[0].url).toBe(
            "https://tinybird.test/v0/events?name=generation_event_v2",
        );
        expect(tinybirdRequests[0].headers.get("authorization")).toBe(
            "Bearer test_tinybird_token",
        );
        const event = await tinybirdRequests[0].json();
        expect(event).toMatchObject({
            requestPath: "/v1/chat/completions",
            environment: "test",
            eventType: "generate.text",
            responseStatus: 200,
            modelRequested: "openai",
            resolvedModelRequested: "openai",
            modelUsed: "gpt-5-nano-2025-08-07",
            modelProviderUsed: expect.any(String),
            userId: trackingUser.id,
            isBilledUsage: true,
            tokenCountPromptText: 1000,
            tokenCountCompletionText: 500,
            referrerUrl: "https://example.com/app",
            referrerDomain: "example.com",
            ipSubnet: "203.0.113.0",
        });
        expect(event).not.toHaveProperty("cacheHit");
        expect(event).not.toHaveProperty("cacheKey");
        expect(consumePollen).toHaveBeenCalledWith(expect.any(Number));
        expect(consumePollen.mock.calls[0]?.[0]).toBeGreaterThan(0);
    });

    it("does not bill a successful text response when upstream usage is missing", async () => {
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
        const response = await createHeaderApp(
            { "x-usage-missing": "true" },
            trackingUser,
            200,
            consumePollen,
        ).fetch(
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        const event = (await tinybirdRequests[0].json()) as TinybirdEvent;
        expect(event).toMatchObject({
            responseStatus: 200,
            isBilledUsage: false,
            totalCost: 0,
            totalPrice: 0,
        });
        expect(event.modelUsed).toBe("openai");
        expect(consumePollen).toHaveBeenCalledWith(0);
    });

    it("still bills a flat request fee when token usage is missing", async () => {
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
        const response = await createHeaderApp(
            { "x-usage-missing": "true" },
            trackingUser,
            200,
            consumePollen,
            "perplexity-fast",
        ).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "perplexity-fast",
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        const event = (await tinybirdRequests[0].json()) as TinybirdEvent;
        expect(event).toMatchObject({
            responseStatus: 200,
            isBilledUsage: true,
            modelUsed: "perplexity-fast",
            totalCost: 0.005,
            totalPrice: 0.005,
            adjustmentCosts: {
                "perplexity.sonar_low.search_request.v1": 0.005,
            },
            adjustmentUnits: {
                "perplexity.sonar_low.search_request.v1": 1,
            },
        });
        expect(consumePollen).toHaveBeenCalledWith(0.005);
    });

    it("records and deducts the effective long-context price sheet", async () => {
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
        const model: ModelVariables["model"] = {
            requested: "gpt-5.4",
            resolved: "gpt-5.4",
            definition: getRegistryModelDefinition("gpt-5.4"),
        };

        const ctx = createExecutionContext();
        const response = await createTestApp(
            consumePollen,
            trackingUser,
            model,
            {
                "x-model-used": "gpt-5.4",
                "x-usage-prompt-text-tokens": "272001",
                "x-usage-completion-text-tokens": "1000",
            },
        ).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "gpt-5.4",
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        const event = (await tinybirdRequests[0].json()) as TinybirdEvent;
        const expectedCost = 272_001 * (5 / 1e6) + 1_000 * (22.5 / 1e6);
        expect(event).toMatchObject({
            modelRequested: "gpt-5.4",
            resolvedModelRequested: "gpt-5.4",
            costVariant: "long_context",
            costVariantStatus: "selected",
            tokenPricePromptText: 5 / 1e6,
            tokenPriceCompletionText: 22.5 / 1e6,
            tokenCountPromptText: 272_001,
            tokenCountCompletionText: 1_000,
            totalCost: expectedCost,
            totalPrice: expectedCost,
            devPrice: expectedCost,
        });
        expect(consumePollen).toHaveBeenCalledWith(expectedCost);
    });

    it("records OpenRouter provider cost without changing billing", async () => {
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
        const model: ModelVariables["model"] = {
            requested: "qwen-large",
            resolved: "qwen-large",
            definition: getRegistryModelDefinition("qwen-large"),
        };

        const ctx = createExecutionContext();
        await createTestApp(consumePollen, trackingUser, model, {
            "x-provider-reported-cost": "0.123",
        }).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "qwen-large",
                    stream: false,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        const event = (await tinybirdRequests[0].json()) as TinybirdEvent;
        const providerReportedCost = event.providerReportedCost;
        expect(providerReportedCost).toBe(0.123);
        if (providerReportedCost === undefined) {
            throw new Error("Expected provider-reported cost");
        }
        expect(event.providerCostDelta).toBeCloseTo(
            event.totalCost - providerReportedCost,
        );
        expect(consumePollen).toHaveBeenCalledWith(event.devPrice);
    });

    it("does not emit Tinybird generation events for cache hits", async () => {
        const tinybirdFetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("ok"));
        const consumePollen = vi.fn(async (_amount: number) => {});

        const ctx = createExecutionContext();
        const response = await createHeaderApp(
            { "x-cache": "HIT" },
            trackingUser,
            200,
            consumePollen,
        ).fetch(
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("x-cache")).toBe("HIT");
        expect(consumePollen).toHaveBeenCalledWith(0);
        expect(tinybirdFetch).not.toHaveBeenCalled();
    });

    it("records the resolved model on a failed generation", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const consumePollen = vi.fn(async (_amount: number) => {});

        const ctx = createExecutionContext();
        const response = await createHeaderApp(
            {},
            trackingUser,
            502,
            consumePollen,
        ).fetch(
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        expect(tinybirdRequests).toHaveLength(1);
        // modelUsed comes from the resolved model, not the upstream
        // x-model-used header, so error rows attribute the failure instead of
        // falling back to the datasource DEFAULT 'undefined'.
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            responseStatus: 502,
            resolvedModelRequested: "openai",
            modelUsed: "openai",
            isBilledUsage: false,
        });
    });

    it("does not emit Tinybird generation events for unauthenticated requests", async () => {
        const tinybirdFetch = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("ok"));

        const ctx = createExecutionContext();
        const response = await createHeaderApp({}, null, 401).fetch(
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(401);
        expect(tinybirdFetch).not.toHaveBeenCalled();
    });

    it("does not trigger auto top-up while post-deduction pack balance is above threshold", async () => {
        const db = drizzle(env.DB);
        const userId = `track-auto-top-up-${crypto.randomUUID()}`;
        await db.insert(userTable).values({
            id: userId,
            email: `${userId}@test.local`,
            name: "Track Auto Top Up Test",
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
                    "https://tinybird.test/v0/events?name=generation_event_v2",
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
                tierBalance: 1,
                packBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: ownerId,
                email: `${ownerId}@test.local`,
                name: "Track Community Owner",
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
                    "https://tinybird.test/v0/events?name=generation_event_v2",
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
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
            modelUsed: "openai",
        });
        expect(consumePollen).toHaveBeenCalledWith(0);
    });

    it("bills timestamped audio JSON without copying base64 audio into analytics", async () => {
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
        const upstream = Response.json(
            {
                audio_base64: "large-audio-payload",
                alignment: { characters: ["H", "i"] },
            },
            {
                headers: {
                    "x-model-used": "elevenlabs",
                    "x-usage-completion-audio-tokens": "2",
                    "x-pollinations-response-format": "audio-with-timestamps",
                },
            },
        );

        const ctx = createExecutionContext();
        const response = await createWrongContentTypeApp(
            consumePollen,
            "generate.audio",
            upstream,
            "elevenlabs",
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "POST",
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
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
            eventType: "generate.audio",
            isBilledUsage: true,
            tokenCountCompletionAudio: 2,
        });
        expect(JSON.stringify(event)).not.toContain("large-audio-payload");
        expect(consumePollen).toHaveBeenCalledWith(0.0002);
    });

    it("bills plain-text speech-to-text responses from usage headers", async () => {
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
        const upstream = new Response("hello world", {
            headers: {
                "content-type": "text/plain; charset=utf-8",
                "x-model-used": "universal-3.5-pro",
                "x-usage-prompt-audio-seconds": "6",
            },
        });

        const ctx = createExecutionContext();
        const response = await createWrongContentTypeApp(
            consumePollen,
            "generate.audio",
            upstream,
            "universal-3.5-pro",
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "POST",
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            eventType: "generate.audio",
            isBilledUsage: true,
            tokenCountPromptAudioSeconds: 6,
            totalCost: 0.00035,
            totalPrice: 0.00035,
        });
        expect(consumePollen).toHaveBeenCalledWith(0.00035);
    });

    it("does not bill ordinary TTS when a provider returns JSON with HTTP 200", async () => {
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
        const upstream = Response.json(
            { error: "unexpected provider response" },
            {
                headers: {
                    "x-model-used": "elevenlabs",
                    "x-usage-completion-audio-tokens": "2",
                },
            },
        );

        const ctx = createExecutionContext();
        await createWrongContentTypeApp(
            consumePollen,
            "generate.audio",
            upstream,
            "elevenlabs",
        ).fetch(
            new Request("https://gen.pollinations.ai/upstream", {
                method: "POST",
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(tinybirdRequests).toHaveLength(1);
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            eventType: "generate.audio",
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
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
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
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

    it("captures endTime at stream completion so responseTime covers the whole request", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );

        // 4 chunks × 50ms upstream delay; first-byte capture would record ~0ms.
        const ctx = createExecutionContext();
        const response = await createSseStreamApp(50).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai",
                    stream: true,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(tinybirdRequests).toHaveLength(1);
        const event = (await tinybirdRequests[0].json()) as {
            responseTime: number;
            startTime: string;
            endTime: string;
            tokenCountCompletionText: number;
            modelUsed: string;
            isBilledUsage: boolean;
        };
        expect(event.responseTime).toBeGreaterThanOrEqual(100);
        expect(
            new Date(event.endTime).getTime() -
                new Date(event.startTime).getTime(),
        ).toBeGreaterThanOrEqual(100);
        expect(event.tokenCountCompletionText).toBe(500);
        expect(event.modelUsed).toBe("gpt-5-nano-2025-08-07");
        expect(event.isBilledUsage).toBe(true);
    });

    it("extracts OpenRouter provider cost from streamed usage", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );

        const ctx = createExecutionContext();
        await createSseStreamApp(0, "qwen-large", 0.456).fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "qwen-large",
                    stream: true,
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                DB: env.DB,
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                BETTER_AUTH_SECRET: "test_secret",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        const event = (await tinybirdRequests[0].json()) as TinybirdEvent;
        const providerReportedCost = event.providerReportedCost;
        expect(providerReportedCost).toBe(0.456);
        if (providerReportedCost === undefined) {
            throw new Error("Expected provider-reported cost");
        }
        expect(event.providerCostDelta).toBeCloseTo(
            event.totalCost - providerReportedCost,
        );
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

function requestTrackingFixture(
    streamRequested = false,
    model: ModelName = "openai",
) {
    const definition = getRegistryModelDefinition(model);
    const modelCostDefinition = definition.cost;
    const modelPriceDefinition = getPriceDefinitionForModel(definition);
    if (!modelCostDefinition || !modelPriceDefinition) {
        throw new Error(`Missing cost/price definition for ${model}`);
    }
    return {
        modelRequested: model,
        resolvedModelRequested: model,
        modelProvider: definition.provider,
        modelDefinition: definition,
        modelCostDefinition,
        modelPriceDefinition,
        streamRequested,
        referrerData: {},
    };
}

describe("trackResponse modelUsed", () => {
    it("attributes a failed generation to the resolved model", async () => {
        const tracking = await trackResponse(
            "generate.text",
            requestTrackingFixture(),
            new Response("upstream exploded", { status: 502 }),
        );
        expect(tracking).toMatchObject({
            responseStatus: 502,
            cacheHit: false,
            isBilledUsage: false,
            modelUsed: "openai",
        });
    });

    it("attributes a 200 with an unexpected content-type to the resolved model", async () => {
        const tracking = await trackResponse(
            "generate.image",
            requestTrackingFixture(),
            // A JSON error body served with HTTP 200 instead of an image.
            Response.json({ error: "boom" }),
        );
        expect(tracking).toMatchObject({
            responseStatus: 200,
            isBilledUsage: false,
            modelUsed: "openai",
        });
    });

    it("attributes a 200 with unextractable usage to the resolved model", async () => {
        // A well-formed SSE stream that never carries a usage object, so
        // extraction returns no ModelUsage and the request is not billed.
        const tracking = await trackResponse(
            "generate.text",
            requestTrackingFixture(true),
            new Response(
                'data: {"model":"gpt-5-nano","choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
                { headers: { "content-type": "text/event-stream" } },
            ),
        );
        expect(tracking).toMatchObject({
            responseStatus: 200,
            isBilledUsage: false,
            modelUsed: "openai",
        });
    });

    it("does not attribute a model to a cache hit", async () => {
        const tracking = await trackResponse(
            "generate.text",
            requestTrackingFixture(),
            Response.json({ choices: [] }, { headers: { "x-cache": "HIT" } }),
        );
        expect(tracking.cacheHit).toBe(true);
        expect(tracking.isBilledUsage).toBe(false);
        expect(tracking.modelUsed).toBeUndefined();
    });
});

function makeAdjustment(
    ruleId: string,
    cost: number,
    units: number,
): BillingAdjustment {
    return {
        ruleId,
        kind: "search_request",
        unit: "request",
        units,
        unitCost: units === 0 ? 0 : cost / units,
        cost,
        price: cost,
    };
}

describe("reduceAdjustmentsToEventFields", () => {
    it("returns undefined map fields when there are no adjustments", () => {
        expect(reduceAdjustmentsToEventFields(undefined)).toEqual({});
        expect(reduceAdjustmentsToEventFields([])).toEqual({});
    });

    it("maps a single adjustment to keyed cost/units records", () => {
        expect(
            reduceAdjustmentsToEventFields([
                makeAdjustment("openrouter.google.web_search.v1", 0.042, 3),
            ]),
        ).toEqual({
            adjustmentCosts: { "openrouter.google.web_search.v1": 0.042 },
            adjustmentUnits: { "openrouter.google.web_search.v1": 3 },
        });
    });

    it("maps two distinct rule ids into both records", () => {
        expect(
            reduceAdjustmentsToEventFields([
                makeAdjustment("openrouter.google.web_search.v1", 0.042, 3),
                makeAdjustment(
                    "perplexity.sonar_low.search_request.v1",
                    0.006,
                    1,
                ),
            ]),
        ).toEqual({
            adjustmentCosts: {
                "openrouter.google.web_search.v1": 0.042,
                "perplexity.sonar_low.search_request.v1": 0.006,
            },
            adjustmentUnits: {
                "openrouter.google.web_search.v1": 3,
                "perplexity.sonar_low.search_request.v1": 1,
            },
        });
    });

    it("survives the JSON.stringify(removeUnset(event)) ingestion round-trip", () => {
        // Mirror shared/events.ts sendToTinybird: body = JSON.stringify(removeUnset(event)).
        const withAdjustments = {
            id: "evt_with",
            isBilledUsage: true,
            ...reduceAdjustmentsToEventFields([
                makeAdjustment("openrouter.google.web_search.v1", 0.042, 3),
            ]),
        } as unknown as TinybirdEvent;
        const parsedWith = JSON.parse(
            JSON.stringify(removeUnset(withAdjustments)),
        );
        expect(parsedWith.adjustmentCosts).toEqual({
            "openrouter.google.web_search.v1": 0.042,
        });
        expect(parsedWith.adjustmentUnits).toEqual({
            "openrouter.google.web_search.v1": 3,
        });

        // No adjustments → neither key is present in the serialized payload
        // (removeUnset drops undefined; ClickHouse DEFAULT map() fills them).
        const withoutAdjustments = {
            id: "evt_without",
            isBilledUsage: true,
            ...reduceAdjustmentsToEventFields([]),
        } as unknown as TinybirdEvent;
        const serializedWithout = JSON.stringify(
            removeUnset(withoutAdjustments),
        );
        expect(serializedWithout).not.toContain("adjustmentCosts");
        expect(serializedWithout).not.toContain("adjustmentUnits");
        const parsedWithout = JSON.parse(serializedWithout);
        expect(parsedWithout).not.toHaveProperty("adjustmentCosts");
        expect(parsedWithout).not.toHaveProperty("adjustmentUnits");
    });
});
