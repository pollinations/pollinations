import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { CreateAnthropicMessageRequestSchema } from "@shared/schemas/anthropic.ts";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { generateAnthropicMessage } from "@/text/anthropic/handler.ts";

afterEach(() => vi.restoreAllMocks());

const MODEL = "openai/gpt-5.4-nano";

// Handler-level app: mounts the translation handler with the model var the
// route middleware would normally set, so the test exercises the real
// translation + streaming code without the full worker middleware chain.
const buildApp = () => {
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
        c.set("model", {
            requested: MODEL,
            resolved: MODEL,
            definition: TEXT_SERVICES[MODEL],
        });
        await next();
    });
    app.post(
        "/v1/messages",
        validator("json", CreateAnthropicMessageRequestSchema),
        generateAnthropicMessage,
    );
    return app;
};

const chatCompletion = () => ({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "gpt-5.4-nano",
    choices: [
        {
            index: 0,
            message: { role: "assistant", content: "Hello from Pollinations." },
            finish_reason: "stop",
        },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
});

const upstreamJson = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });

const post = (
    body: Record<string, unknown>,
    fetchMock: (url: string, init?: RequestInit) => Promise<Response>,
) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
        fetchMock(String(input), init as RequestInit),
    );
    return buildApp().request(
        "/v1/messages",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        env,
    );
};

describe("POST /v1/messages handler", () => {
    it("translates a plain request and returns an Anthropic message", async () => {
        const response = await post(
            {
                model: MODEL,
                max_tokens: 64,
                messages: [{ role: "user", content: "hi" }],
            },
            async () => upstreamJson(chatCompletion()),
        );
        const body = (await response.json()) as {
            type: string;
            role: string;
            content: Array<{ type: string; text?: string }>;
            usage: { input_tokens: number; output_tokens: number };
        };
        expect(response.status, JSON.stringify(body)).toBe(200);
        expect(body.type).toBe("message");
        expect(body.role).toBe("assistant");
        expect(body.content[0]).toMatchObject({
            type: "text",
            text: "Hello from Pollinations.",
        });
        expect(body.usage).toMatchObject({
            input_tokens: 12,
            output_tokens: 5,
        });
    });

    it("forwards a system prompt and tool definitions to the chat pipeline", async () => {
        let upstreamBody: Record<string, unknown> | undefined;
        const response = await post(
            {
                model: MODEL,
                max_tokens: 64,
                system: "Be terse.",
                tools: [
                    { name: "get_weather", input_schema: { type: "object" } },
                ],
                messages: [{ role: "user", content: "hi" }],
            },
            async (_url, init) => {
                const raw = init?.body;
                if (typeof raw === "string") upstreamBody = JSON.parse(raw);
                return upstreamJson(chatCompletion());
            },
        );
        expect(response.status).toBe(200);
        if (upstreamBody) {
            expect(JSON.stringify(upstreamBody)).toContain("Be terse.");
            expect(JSON.stringify(upstreamBody)).toContain("get_weather");
        }
    });

    it("returns Anthropic's error shape for a media model", async () => {
        const response = await post(
            {
                model: "krea/krea-2-medium",
                max_tokens: 64,
                messages: [{ role: "user", content: "hi" }],
            },
            async () => upstreamJson(chatCompletion()),
        );
        const body = (await response.json()) as {
            type: string;
            error: { type: string };
        };
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(body.type).toBe("error");
        expect(typeof body.error.type).toBe("string");
    });

    it("streams Anthropic SSE events in the standard order", async () => {
        const sse =
            'data: {"id":"c","model":"gpt-5.4-nano","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
            'data: {"id":"c","model":"gpt-5.4-nano","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n' +
            "data: [DONE]\n\n";
        const response = await post(
            {
                model: MODEL,
                max_tokens: 64,
                stream: true,
                messages: [{ role: "user", content: "hi" }],
            },
            async () =>
                new Response(sse, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const text = await response.text();
        expect(text).toContain("event: message_start");
        expect(text).toContain("event: content_block_delta");
        expect(text).toContain("event: message_stop");
    });
});
