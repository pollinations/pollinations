import { describe, expect, it } from "vitest";
import {
    publicChatChoices,
    publicChatStream,
} from "../../src/text/chat/public.ts";
import { requireChatStreamUsage } from "../../src/text/chat/usage.ts";

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
