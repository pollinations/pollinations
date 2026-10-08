import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { CreateResponseRequestSchema } from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { resolveDirectResponsesTarget } from "@/text/responses/client.ts";
import { generateCreateResponse } from "@/text/responses/handler.ts";

const CHAT_ONLY_MODEL = "anthropic/claude-sonnet-4.6";
const chatUsage = {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
};
const chatCompletion = {
    id: "chatcmpl-test",
    created: 1700000000,
    model: CHAT_ONLY_MODEL,
    choices: [
        {
            index: 0,
            message: { role: "assistant", content: "Hi from Claude" },
            finish_reason: "stop",
        },
    ],
    usage: chatUsage,
};

function chatJsonResponse() {
    return new Response(JSON.stringify(chatCompletion), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function chatSseResponse() {
    const encoder = new TextEncoder();
    const chunks = [
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Hi from Claude" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: chatUsage })}\n\n`,
        "data: [DONE]\n\n",
    ];
    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
}

function app() {
    const hono = new Hono<Env>();
    hono.use("*", async (c, next) => {
        c.set("model", {
            requested: "claude-sonnet-4.6",
            resolved: CHAT_ONLY_MODEL,
            definition: TEXT_SERVICES[CHAT_ONLY_MODEL],
        });
        await next();
    });
    hono.post(
        "/v1/responses",
        validator("json", CreateResponseRequestSchema),
        generateCreateResponse,
    );
    return hono;
}

function post(stream: boolean) {
    return app().request(
        "/v1/responses",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "claude-sonnet-4.6",
                input: "Hello",
                store: false,
                safe: false,
                ...(stream ? { stream: true } : {}),
            }),
        },
        env,
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("adapted Responses over Chat (#16674)", () => {
    it("resolves no native target for the chat-only model", () => {
        expect(
            resolveDirectResponsesTarget(CHAT_ONLY_MODEL, {
                model: CHAT_ONLY_MODEL,
                input: "Hello",
            } as never),
        ).toBeNull();
    });

    it("serves non-streaming Responses through the Chat pipeline", async () => {
        const bodies: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            bodies.push(String(init?.body ?? ""));
            return chatJsonResponse();
        });
        const response = await post(false);
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            object: string;
            status: string;
            output: Array<{ type: string; content?: Array<{ text?: string }> }>;
            usage: { input_tokens: number };
        };
        expect(body.object).toBe("response");
        expect(body.status).toBe("completed");
        expect(JSON.stringify(body.output)).toContain("Hi from Claude");
        expect(body.usage.input_tokens).toBe(10);
        // The uphill mapping really reached upstream with the user input.
        expect(bodies.length).toBeGreaterThan(0);
        expect(bodies.some((b) => b.includes("Hello"))).toBe(true);
    });

    it("serves streaming Responses through the Chat pipeline", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
            chatSseResponse(),
        );
        const response = await post(true);
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("response.created");
        expect(text).toContain("response.output_text.delta");
        expect(text).toContain("Hi from Claude");
        expect(text).toContain("response.completed");
        // No [DONE] sentinel — the Responses stream ends on response.completed.
        expect(text).not.toContain("[DONE]");
        expect(text).toContain("response.completed");
        expect(text).toContain('"sequence_number"');
    });
});
