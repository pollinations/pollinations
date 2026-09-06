import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import {
    firstCommunityImageBytes,
    firstCommunityVideoBytes,
} from "@shared/community-media.ts";
import {
    ensureUpstreamOk,
    getErrorCodesForStatus,
    handleError,
    UpstreamError,
} from "@shared/error.ts";
import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import { handleChatCompletionLocal } from "@/text/handler.ts";
import { isRetryableFallbackError } from "../src/fallback.ts";
import { throwImageError } from "../src/image/handler.ts";
import { throw3dError } from "../src/model3d/handler.ts";
import { throwTextError } from "../src/text/errors.ts";
import { UserImageError } from "../src/userImage.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function createTestApp() {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.post("/v1/chat/completions", async (c) => {
        await c.req.json();
        c.set("model", {
            requested: "openai",
            resolved: "openai",
            definition: getRegistryModelDefinition("openai"),
        });
        throw new UpstreamError(502, {
            message:
                "Stream requested for model openai but upstream returned content-type: application/json",
            requestUrl: new URL("https://portkey.test/v1/chat/completions"),
            responseBody: "application/json",
            cause: new Error("unexpected content type"),
        });
    });
    app.onError(handleError);

    return app;
}

function createTextTestApp() {
    const app = new Hono<Env>();
    app.use("*", requestId());
    app.use("*", logger);
    app.post("/v1/chat/completions", async (c) =>
        handleChatCompletionLocal(c, await c.req.json()),
    );
    app.onError(handleError);
    return app;
}

describe("error observability", () => {
    it.each([
        ["image", firstCommunityImageBytes],
        ["video", firstCommunityVideoBytes],
    ] as const)("preserves a retryable community %s failure when its error body cannot be read", async (kind, readMedia) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(
                            new TypeError("invalid compressed data"),
                        );
                    },
                }),
                { status: 503 },
            ),
        );
        const error = await readMedia(
            { data: [{ url: "https://assets.test/output" }] },
            "https://provider.test",
        ).catch((error) => error);
        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({
            status: 502,
            upstreamStatus: 503,
            requestUrl: new URL("https://assets.test/output"),
            message: `Endpoint ${kind} URL responded 503`,
            responseBody: undefined,
        });
        expect(isRetryableFallbackError(error)).toBe(true);
    });

    it.each([
        "ContentModerationError",
        "content_policy_violation",
        "content_safety_violation",
    ])("classifies provider code/type %s without rewriting its body", async (type) => {
        const responseBody = JSON.stringify({
            error: { type, message: "Request rejected" },
        });
        const error = await ensureUpstreamOk(
            new Response(responseBody, { status: 403 }),
            "https://provider.test",
        ).catch((error) => error);
        expect(isRetryableFallbackError(error)).toBe(false);
        try {
            throwImageError(error);
        } catch (caught) {
            expect(caught).toMatchObject({
                status: 422,
                errorCode: "content_policy_violation",
                responseBody,
            });
        }
    });

    it("does not classify echoed prompt words as an image moderation failure", async () => {
        const responseBody = JSON.stringify({
            error: { code: "over_capacity" },
            request: { prompt: "Explain the NSFW label" },
        });
        const error = await ensureUpstreamOk(
            new Response(responseBody, { status: 503 }),
            "https://provider.test",
        ).catch((error) => error);
        expect(isRetryableFallbackError(error)).toBe(true);
        expect(() => throwImageError(error)).toThrow(error);
        expect(error).toMatchObject({ status: 503, responseBody });
    });

    it.each([
        ["image", throwImageError],
        ["3D", throw3dError],
        ["text", throwTextError],
    ] as const)("returns complete provider bodies through the %s boundary", async (_name, throwError) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
        const message = `Provider diagnostic ${"x".repeat(20000)} END`;
        const body = JSON.stringify(
            {
                error: {
                    message,
                    diagnostic: {
                        token: "provider-test-token",
                        extra: [1, 2, 3],
                    },
                },
            },
            null,
            2,
        );
        const app = new Hono<Env>();
        app.use("*", logger);
        app.get("/", async () => {
            try {
                await ensureUpstreamOk(
                    new Response(body, { status: 429 }),
                    "https://provider.test/generate",
                );
            } catch (error) {
                throwError(error as UpstreamError);
            }
            return new Response("unexpected success");
        });
        app.onError(handleError);
        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.test/"),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "error",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as unknown as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(502);
        expect(await response.json()).toMatchObject({
            status: 502,
            error: {
                message,
                details: {
                    upstreamStatus: 429,
                    upstreamHost: "provider.test",
                    upstreamBody: body,
                },
            },
        });
    });

    it.each([
        `plain provider error\n${"x".repeat(20000)}`,
        "<html><body>gateway detail</body></html>",
    ])("preserves non-JSON provider errors", async (body) => {
        await expect(
            ensureUpstreamOk(
                new Response(body, { status: 408 }),
                "https://provider.test/",
            ),
        ).rejects.toMatchObject({
            message: body,
            responseBody: body,
            status: 504,
            upstreamStatus: 408,
        });
    });

    it.each([
        [401, 502],
        [403, 502],
        [408, 504],
        [415, 415],
        [429, 502],
        [503, 503],
        [524, 502],
    ])("maps provider %s to public %s without changing its body", (upstreamStatus, status) => {
        const responseBody = '{"detail":"original provider detail"}';
        expect(
            UpstreamError.fromProvider(upstreamStatus, {
                message: responseBody,
                responseBody,
            }),
        ).toMatchObject({
            status,
            upstreamStatus,
            responseBody,
            message: responseBody,
        });
    });

    it("preserves raw diagnostics when classifying image validation and moderation", () => {
        for (const [body, expectedStatus, code] of [
            ['{"detail":[{"msg":"width is too small"}]}', 400, undefined],
            [
                '{"error":{"message":"content policy violation","extra":"keep this"}}',
                422,
                "content_policy_violation",
            ],
        ] as const) {
            const error = UpstreamError.fromProvider(422, {
                message: "provider rejection",
                responseBody: body,
            });
            try {
                throwImageError(error);
            } catch (caught) {
                expect(caught).toMatchObject({
                    status: expectedStatus,
                    upstreamStatus: 422,
                    responseBody: body,
                    message: "provider rejection",
                    errorCode: code,
                });
            }
        }
    });

    it("keeps user-image failures at 400 with their original image-host status", () => {
        const error = new UserImageError(
            "Image URL is unavailable",
            "failed_to_download_image",
            new URL("https://images.test/"),
            429,
        );
        for (const throwError of [
            throwImageError,
            throw3dError,
            throwTextError,
        ]) {
            expect(() => throwError(error)).toThrow(error);
        }
        expect(error).toMatchObject({
            status: 400,
            upstreamStatus: 429,
            errorCode: "failed_to_download_image",
        });
    });

    it.each([
        "KEY_BUDGET_EXHAUSTED",
        "INSUFFICIENT_BALANCE",
    ] as const)("preserves the payment reason %s in the 402 envelope", async (code) => {
        const app = new Hono<Env>();
        app.use("*", logger);
        app.get("/", () => {
            throw new PaymentRequiredError(code, "Actionable payment guidance");
        });
        app.onError(handleError);
        const response = await app.fetch(
            new Request("https://gen.test/"),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "error",
                LOG_FORMAT: "text",
            } as unknown as CloudflareBindings,
            createExecutionContext(),
        );
        expect(response.status).toBe(402);
        expect(await response.json()).toMatchObject({
            status: 402,
            error: { code, message: "Actionable payment guidance" },
        });
        expect(getErrorCodesForStatus(402)).toContain(code);
    });

    it("emits structured Tinybird error events for actionable upstream failures", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );

        const ctx = createExecutionContext();
        const response = await createTestApp().fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai",
                    stream: true,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "test" },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "https://example.com/a.png",
                                    },
                                },
                                {
                                    type: "input_audio",
                                    input_audio: {
                                        data: "abc",
                                        format: "mp3",
                                    },
                                },
                            ],
                        },
                        { role: "assistant", content: "hello" },
                    ],
                    tools: [
                        {
                            type: "function",
                            function: { name: "lookup" },
                        },
                    ],
                    tool_choice: "auto",
                    response_format: { type: "json_object" },
                    max_tokens: 256,
                    temperature: 0.7,
                }),
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        const body = (await response.json()) as {
            error: Record<string, unknown>;
        };
        expect(body).toMatchObject({
            success: false,
            error: {
                details: {
                    name: "UpstreamError",
                    upstreamHost: "portkey.test",
                    upstreamBody: "application/json",
                },
            },
        });
        expect(body.error).not.toHaveProperty("cause");

        expect(tinybirdRequests).toHaveLength(1);
        expect(tinybirdRequests[0].url).toBe(
            "https://tinybird.test/v0/events?name=error_event",
        );
        expect(tinybirdRequests[0].headers.get("authorization")).toBe(
            "Bearer test_tinybird_token",
        );
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            severity: "error",
            environment: "test",
            route_path: "/v1/chat/completions",
            method: "POST",
            status: 502,
            error_code: "BAD_GATEWAY",
            error_class: "UpstreamError",
            upstream_host: "portkey.test",
            upstream_body: "application/json",
            model_requested: "openai",
            resolved_model_requested: "openai",
            request_inputs: expect.any(String),
        });
        expect(
            JSON.parse(tinybirdPayload.request_inputs as string),
        ).toMatchObject({
            body: {
                model: "openai",
                stream: true,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "test" },
                            {
                                type: "image_url",
                                image_url: {
                                    url: "https://example.com/a.png",
                                },
                            },
                            {
                                type: "input_audio",
                                input_audio: {
                                    data: "abc",
                                    format: "mp3",
                                },
                            },
                        ],
                    },
                    { role: "assistant", content: "hello" },
                ],
                tools: [
                    {
                        type: "function",
                        function: { name: "lookup" },
                    },
                ],
                tool_choice: "auto",
                response_format: { type: "json_object" },
                max_tokens: 256,
                temperature: 0.7,
            },
        });
        expect(tinybirdPayload).not.toHaveProperty("upstream_status");
    });

    it("does not mask 5xx errors when no route matched", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const app = new Hono<Env>();
        app.notFound((c) => {
            c.set("log", {
                error: vi.fn(),
                trace: vi.fn(),
                warn: vi.fn(),
            } as never);
            return handleError(new HTTPException(500), c);
        });
        app.onError(handleError);

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request(
                "https://gen.pollinations.ai/unmatched?x=1&key=sk_secret&token=secret_token",
            ),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: {
                code: "INTERNAL_ERROR",
            },
        });

        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            route_path: "/unmatched",
            status: 500,
            error_class: "Error",
            request_inputs: JSON.stringify({
                query: {
                    x: "1",
                    key: "[redacted]",
                    token: "[redacted]",
                },
            }),
        });
    });

    it("redacts credential fields from request bodies in error telemetry", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );

        const app = new Hono<Env>();
        app.post("/body-error", () => {
            throw new Error("body failure");
        });
        app.onError(handleError);

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request(
                "https://gen.pollinations.ai/body-error?api_key=query_secret",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        bearerToken: "sk_body_secret",
                        authorization: "Bearer body_secret",
                        nested: {
                            api_key: "nested_api_secret",
                            apiKey: "nested_api_key_secret",
                            token: "nested_token_secret",
                            keep: "visible",
                        },
                        items: [
                            {
                                key: "array_key_secret",
                                access_token: "array_access_secret",
                                accessToken: "array_access_token_secret",
                            },
                        ],
                    }),
                },
            ),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(500);
        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        const requestInputsText = tinybirdPayload.request_inputs as string;
        expect(requestInputsText).not.toContain("sk_body_secret");
        expect(requestInputsText).not.toContain("body_secret");
        expect(requestInputsText).not.toContain("nested_api_secret");
        expect(requestInputsText).not.toContain("nested_api_key_secret");
        expect(requestInputsText).not.toContain("nested_token_secret");
        expect(requestInputsText).not.toContain("array_key_secret");
        expect(requestInputsText).not.toContain("array_access_secret");
        expect(requestInputsText).not.toContain("array_access_token_secret");
        expect(JSON.parse(requestInputsText)).toMatchObject({
            query: {
                api_key: "[redacted]",
            },
            body: {
                bearerToken: "[redacted]",
                authorization: "[redacted]",
                nested: {
                    api_key: "[redacted]",
                    apiKey: "[redacted]",
                    token: "[redacted]",
                    keep: "visible",
                },
                items: [
                    {
                        key: "[redacted]",
                        access_token: "[redacted]",
                        accessToken: "[redacted]",
                    },
                ],
            },
        });
    });

    it("does not require logger middleware state for 5xx errors", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                tinybirdRequests.push(new Request(input, init));
                return new Response("ok");
            },
        );

        const app = new Hono<Env>();
        app.get("/before-logger", () => {
            throw new Error("pre-logger failure");
        });
        app.onError(handleError);

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/before-logger"),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "pre-logger failure",
            },
        });

        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            route_path: "/before-logger",
            status: 500,
            error_class: "Error",
        });
    });

    it("maps text provider 429 to an actionable server error", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("tinybird.test")) {
                    tinybirdRequests.push(request);
                    return new Response("ok");
                }
                return Response.json(
                    { error: { message: "provider rate limited" } },
                    {
                        status: 429,
                        headers: {
                            authorization: "Bearer must-not-be-recorded",
                            "set-cookie": "session=must-not-be-recorded",
                            "x-debug-detail": "x".repeat(600),
                            "x-generation-id": "gen-openrouter-test",
                            "x-portkey-last-used-option-index":
                                "config.targets[1]",
                            "x-portkey-provider": "openrouter",
                            "x-portkey-retry-attempt-count": "2",
                            "x-portkey-trace-id": "portkey-trace-test",
                        },
                    },
                );
            },
        );

        const ctx = createExecutionContext();
        const incomingRequest = new Request(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [{ role: "user", content: "test" }],
                }),
            },
        );
        Object.defineProperty(incomingRequest, "cf", {
            value: { colo: "FRA" },
        });
        const response = await createTextTestApp().fetch(
            incomingRequest,
            {
                AZURE_MYCELI_PROD_API_KEY: "test_azure_key",
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "BAD_GATEWAY",
                details: {
                    upstreamHost: "portkey.test",
                    upstreamStatus: 429,
                },
            },
        });
        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            status: 502,
            error_code: "BAD_GATEWAY",
            edge_colo: "FRA",
            upstream_host: "portkey.test",
            upstream_status: 429,
        });
        expect(JSON.parse(tinybirdPayload.upstream_headers as string)).toEqual({
            authorization: "[redacted]",
            "content-type": "application/json",
            "set-cookie": "[redacted]",
            "x-debug-detail": "x".repeat(600),
            "x-generation-id": "gen-openrouter-test",
            "x-portkey-last-used-option-index": "config.targets[1]",
            "x-portkey-provider": "openrouter",
            "x-portkey-retry-attempt-count": "2",
            "x-portkey-trace-id": "portkey-trace-test",
        });
        expect(tinybirdPayload.upstream_headers).not.toContain(
            "must-not-be-recorded",
        );
    });

    it("attributes provider error envelopes to the gateway", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("tinybird.test")) {
                    tinybirdRequests.push(request);
                    return new Response("ok");
                }
                return Response.json({
                    error: { message: "Provider returned an empty response" },
                });
            },
        );

        const ctx = createExecutionContext();
        const response = await createTextTestApp().fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                AZURE_MYCELI_PROD_API_KEY: "test_azure_key",
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        const body = (await response.json()) as {
            error: Record<string, unknown>;
        };
        expect(body).toMatchObject({
            error: {
                code: "BAD_GATEWAY",
                message: "Provider returned an empty response",
                details: {
                    upstreamHost: "portkey.test",
                },
            },
        });
        expect(body.error).not.toHaveProperty("cause");
        expect(body.error.details).not.toHaveProperty("upstreamStatus");

        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            status: 502,
            upstream_host: "portkey.test",
        });
        expect(tinybirdPayload).not.toHaveProperty("upstream_status");
    });

    it("attributes aborted provider requests to the gateway", async () => {
        const tinybirdRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("tinybird.test")) {
                    tinybirdRequests.push(request);
                    return new Response("ok");
                }
                throw new DOMException(
                    "The operation was aborted",
                    "AbortError",
                );
            },
        );

        const ctx = createExecutionContext();
        const response = await createTextTestApp().fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                AZURE_MYCELI_PROD_API_KEY: "test_azure_key",
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        const body = (await response.json()) as {
            error: { details: Record<string, unknown> };
        };
        expect(body).toMatchObject({
            error: {
                code: "BAD_GATEWAY",
                message: "The operation was aborted",
                details: { upstreamHost: "portkey.test" },
            },
        });
        expect(body.error.details).not.toHaveProperty("upstreamStatus");
        expect(body.error).not.toHaveProperty("cause");

        expect(tinybirdRequests).toHaveLength(1);
        const tinybirdPayload = (await tinybirdRequests[0].json()) as Record<
            string,
            unknown
        >;
        expect(tinybirdPayload).toMatchObject({
            kind: "server_error",
            status: 502,
            upstream_host: "portkey.test",
        });
        expect(tinybirdPayload).not.toHaveProperty("upstream_status");
    });

    it("retains request metadata after public usage filtering", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "chatcmpl_test",
                object: "chat.completion",
                model: "provider-model",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "ok" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 1,
                    total_tokens: 2,
                    cost: 0.001,
                },
            }),
        );

        let upstreamRequestUrl: URL | undefined;
        const app = new Hono<Env>();
        app.use("*", requestId());
        app.use("*", logger);
        app.post("/v1/chat/completions", async (c) => {
            const response = await handleChatCompletionLocal(
                c,
                await c.req.json(),
            );
            upstreamRequestUrl = c.var.upstreamRequestUrl;
            return response;
        });
        app.onError(handleError);

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                AZURE_MYCELI_PROD_API_KEY: "test_azure_key",
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
            } as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(upstreamRequestUrl?.href).toBe(
            "https://portkey.test/v1/chat/completions",
        );
        const responseText = await response.text();
        expect(responseText).not.toContain("upstreamRequestUrl");
        expect(responseText).not.toContain('"cost"');
    });

    it("codes a rate-limited user image host as a 400 without leaking its status", async () => {
        const fetchRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                fetchRequests.push(request);
                return Response.json(
                    { error: { message: "image host rate limited" } },
                    { status: 429, statusText: "Too Many Requests" },
                );
            },
        );

        const app = new Hono<Env>();
        app.use("*", requestId());
        app.use("*", logger);
        app.post("/v1/chat/completions", async (c) =>
            handleChatCompletionLocal(c, await c.req.json()),
        );
        app.onError(handleError);

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "nova",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "describe this" },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "https://example.com/image.png",
                                    },
                                },
                            ],
                        },
                    ],
                }),
            }),
            {
                AWS_ACCESS_KEY_ID: "test_aws_key_id",
                AWS_REGION: "us-east-1",
                AWS_SECRET_ACCESS_KEY: "test_aws_secret",
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(fetchRequests).toHaveLength(1);
        expect(fetchRequests[0].url).toBe("https://example.com/image.png");
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "failed_to_download_image",
                message: expect.stringContaining(
                    "The image server is rate limiting requests",
                ),
                details: {
                    upstreamHost: "example.com",
                    upstreamStatus: 429,
                },
            },
        });
    });

    it("returns 400 for a status-less invalid image URL error from the provider", async () => {
        const fetchRequests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                fetchRequests.push(new Request(input, init));
                return Response.json({
                    error: {
                        message:
                            "The image URL must be a valid and downloadable URL or look like data:<MIMEType>;base64,<YOUR-BASE64-CONTENT>",
                    },
                });
            },
        );

        const ctx = createExecutionContext();
        const response = await createTextTestApp().fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "gemma",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "describe this" },
                                {
                                    type: "image_url",
                                    image_url: { url: "not-a-valid-image" },
                                },
                            ],
                        },
                    ],
                }),
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                OPENROUTER_API_KEY: "test_openrouter_key",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            status: 400,
            error: {
                code: "BAD_REQUEST",
                message:
                    "The image URL must be a valid and downloadable URL or look like data:<MIMEType>;base64,<YOUR-BASE64-CONTENT>",
                details: {
                    upstreamHost: "openrouter.ai",
                },
            },
        });
        expect(fetchRequests).toHaveLength(1);
        expect(fetchRequests[0].url).toBe(
            "https://openrouter.ai/api/v1/chat/completions",
        );
    });
});
