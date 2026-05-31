import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import {
    handleChatCompletionLocal,
    prepareRequestParameters,
} from "../../src/text/handler.js";
import type { RequestData } from "../../src/text/types.js";

const base = (overrides: Partial<RequestData>): RequestData =>
    ({
        messages: [{ role: "user", content: "hi" }],
        ...overrides,
    }) as RequestData;

afterEach(() => {
    vi.restoreAllMocks();
});

describe("prepareRequestParameters", () => {
    it("strips reasoning_effort for non-reasoning models", () => {
        // The non-reasoning Grok deployment returns an opaque upstream 500 if
        // reasoning_effort is forwarded, so it must be dropped here.
        const result = prepareRequestParameters(
            base({ model: "grok", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBeUndefined();
    });

    it("preserves reasoning_effort for reasoning-capable models", () => {
        const result = prepareRequestParameters(
            base({ model: "grok-large", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBe("high");
    });

    it("leaves params untouched when reasoning_effort is absent", () => {
        const result = prepareRequestParameters(
            base({ model: "grok", temperature: 0.5 }),
        );

        expect(result.reasoning_effort).toBeUndefined();
        expect(result.temperature).toBe(0.5);
    });

    it("still injects audio defaults while stripping reasoning_effort", () => {
        const result = prepareRequestParameters(
            base({ model: "openai-audio", reasoning_effort: "high" }),
        );

        expect(result.reasoning_effort).toBeUndefined();
        expect(result.modalities).toEqual(["text", "audio"]);
        expect(result.audio?.format).toBe("mp3");
    });

    it("strips reasoning_effort on OpenAI-compatible chat completions", async () => {
        const upstreamBodies: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                upstreamBodies.push(await new Request(input, init).json());

                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    created: 0,
                    model: "grok-4-20-non-reasoning",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                });
            },
        );

        const app = new Hono<Env>().post("/v1/chat/completions", async (c) =>
            handleChatCompletionLocal(c, await c.req.json()),
        );

        const ctx = createExecutionContext();
        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                    base({ model: "grok", reasoning_effort: "high" }),
                ),
            }),
            {
                AZURE_MYCELI_PROD_API_KEY: "test_azure_key",
                ENVIRONMENT: "test",
                PORTKEY_GATEWAY_URL: "https://portkey.test",
            } as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(upstreamBodies).toHaveLength(1);
        expect(upstreamBodies[0]).toMatchObject({
            model: "grok-4-20-non-reasoning",
        });
        expect(upstreamBodies[0]).not.toHaveProperty("reasoning_effort");
    });
});
