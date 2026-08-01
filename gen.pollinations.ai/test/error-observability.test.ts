import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { handleError, UpstreamError } from "@shared/error.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import { handleChatCompletionLocal } from "@/text/handler.ts";

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
                    { status: 429 },
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
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            kind: "server_error",
            status: 502,
            error_code: "BAD_GATEWAY",
            upstream_host: "portkey.test",
            upstream_status: 429,
        });
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
            Response.json(
                {
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
                        cost: 0.001,
                    },
                },
                {
                    headers: {
                        "x-portkey-last-used-option-index": "config.targets[1]",
                    },
                },
            ),
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
        expect(response.headers.get("x-fallback-target")).toBe(
            "config.targets[1]",
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
});
