import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { handleError, UpstreamError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function createTestApp() {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.post("/v1/chat/completions", (c) => {
        c.set("model", {
            requested: "openai",
            resolved: "openai",
        });
        throw new UpstreamError(502, {
            message:
                "Stream requested for model openai but upstream returned content-type: application/json",
            requestUrl: new URL("https://portkey.test/v1/chat/completions"),
            upstreamStatus: 200,
            responseBody: "application/json",
        });
    });
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
                    messages: [{ role: "user", content: "test" }],
                }),
            }),
            {
                ENVIRONMENT: "test",
                LOG_LEVEL: "debug",
                LOG_FORMAT: "text",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
            } as CloudflareBindings,
            ctx,
        );

        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: {
                details: {
                    name: "UpstreamError",
                    upstreamStatus: 200,
                    upstreamHost: "portkey.test",
                    upstreamBody: "application/json",
                },
            },
        });

        expect(tinybirdRequests).toHaveLength(1);
        expect(tinybirdRequests[0].url).toBe(
            "https://tinybird.test/v0/events?name=error_event",
        );
        expect(tinybirdRequests[0].headers.get("authorization")).toBe(
            "Bearer test_tinybird_token",
        );
        await expect(tinybirdRequests[0].json()).resolves.toMatchObject({
            kind: "server_error",
            severity: "error",
            environment: "test",
            route_path: "/v1/chat/completions",
            method: "POST",
            status: 502,
            error_code: "BAD_GATEWAY",
            error_class: "UpstreamError",
            upstream_host: "portkey.test",
            upstream_status: 200,
            upstream_body: "application/json",
            model_requested: "openai",
            resolved_model_requested: "openai",
        });
    });
});
