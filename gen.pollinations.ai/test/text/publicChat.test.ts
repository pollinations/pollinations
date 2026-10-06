import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import {
    publicChatChoices,
    publicChatStream,
} from "../../src/text/chat/public.ts";
import { requireChatStreamUsage } from "../../src/text/chat/usage.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const metadata = {
    gateway: { gatewayToolCalls: { exa_search: 1 } },
    other: { citation: "https://example.com" },
};
const usage = {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    cost: 0.007018,
};
const encoder = new TextEncoder();
describe("client gateway metadata", () => {
    it("removes only gateway metadata without mutating the billing completion", () => {
        const choices = [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: "Answer",
                    provider_metadata: metadata,
                    annotations: [{ type: "url_citation" }],
                },
            },
        ];
        const result = publicChatChoices(choices);
        expect(result?.[0].message).toEqual({
            ...choices[0].message,
            provider_metadata: { other: metadata.other },
        });
        expect(choices[0].message.provider_metadata).toEqual(metadata);
        expect(
            publicChatChoices([
                {
                    message: {
                        role: "assistant",
                        provider_metadata: { gateway: metadata.gateway },
                    },
                },
            ])?.[0].message?.provider_metadata,
        ).toBeUndefined();
    });
    it.each([
        "\n",
        "\r\n",
        "\r",
    ])("keeps billing metadata, usage, content and terminal marker across split %j frames", async (newline) => {
        const text =
            `id: first\nevent: message\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "🌼", provider_metadata: metadata } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]`.replaceAll(
                "\n",
                newline,
            );
        const bytes = encoder.encode(text);
        for (let split = 1; split < bytes.length; split++) {
            const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
                start(c) {
                    c.enqueue(bytes.slice(0, split));
                    c.enqueue(bytes.slice(split));
                    c.close();
                },
            });
            const [client, tracking] = requireChatStreamUsage(source).tee();
            const [publicText, billingText] = await Promise.all([
                new Response(publicChatStream(client)).text(),
                new Response(tracking).text(),
            ]);
            expect(billingText).toBe(text);
            expect(publicText).not.toContain('"gateway"');
            expect(publicText).toContain('"other"');
            expect(publicText).toContain("🌼");
            expect(publicText).toContain("id: first\nevent: message\n");
            expect(publicText).toContain("data: [DONE]\n\n");
            expect(publicText).toContain(JSON.stringify(usage));
        }
    });
    it("preserves retry instructions on sanitized Vercel streams", async () => {
        const body = new Response("retry: 1500\n\ndata: [DONE]\n\n").body;
        if (!body) throw new Error("Test response has no body");
        const text = await new Response(publicChatStream(body)).text();
        expect(text).toBe("retry: 1500\n\ndata: [DONE]\n\n");
    });
    it("keeps a validated stream error and does not invent a terminal marker", async () => {
        const body = new Response(
            'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\ndata: [DONE]\n\n',
        ).body;
        if (!body) throw new Error("Test response has no body");
        const text = await new Response(
            publicChatStream(requireChatStreamUsage(body)),
        ).text();
        expect(text).toContain('"usage_missing"');
        expect(text).not.toContain("[DONE]");
    });
});

afterEach(() => vi.restoreAllMocks());
it("passes non-Vercel stream bytes through the real handler unchanged", async () => {
    const model = "google/gemini-2.5-flash-lite:search";
    const { key } = await createTestApiKey({
        expiresIn: 600,
        user: { packBalance: 100 },
    });
    const wire = `retry: 001500\n\ndata: { "custom_number": 1e+2, "choices": [{"delta":{"content":"🌼"}}] }\n\ndata: { "choices": [], "usage": ${JSON.stringify(usage)} }\n\ndata: [DONE]\n\n`;
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).host === "openrouter.ai") {
            calls++;
            return new Response(wire, {
                headers: { "content-type": "text/event-stream" },
            });
        }
        return Response.json({ data: [] });
    });
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [
                    { role: "user", content: `Hello ${crypto.randomUUID()}` },
                ],
            }),
        }),
        withInlineGenerationCoordinator(env),
        context,
    );
    const text = await response.text();
    await waitOnExecutionContext(context);
    expect(response.status, text).toBe(200);
    expect(response.headers.get("x-model-used")).toBe(model);
    expect(calls).toBe(1);
    expect(text).toBe(wire);
});
