import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import { track } from "@/middleware/track.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function createTestApp(consumePollen: (amount: number) => Promise<void>) {
    const app = new Hono<Env>();

    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        c.set("auth", {
            requireAuthorization: async () => {},
            requireUser: () => {
                throw new Error("user should not be required in this test");
            },
            requireModelAccess: () => {},
            requireKeyBudget: () => {},
        });
        c.set("balance", {
            requirePositiveBalance: async () => {},
            requirePaidBalance: async () => {},
            getBalance: async () => ({
                tierBalance: 1,
                packBalance: 0,
            }),
        });
        c.set("frontendKeyRateLimit", { consumePollen });
        c.set("model", {
            requested: "openai",
            resolved: "openai",
        });
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
});
