import { afterEach, describe, expect, it, vi } from "vitest";
import { generateResponsePortkey } from "@/text/generateResponsePortkey.ts";

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZURE_MYCELI_PROD_API_KEY;
});

describe("generateResponsePortkey", () => {
    it("sends Responses API requests with Azure's supported API version", async () => {
        process.env.AZURE_MYCELI_PROD_API_KEY = "test-azure-key";
        let upstreamRequest: Request | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                upstreamRequest = new Request(input, init);
                return Response.json({
                    id: "resp_test",
                    object: "response",
                    model: "gpt-5.5",
                    output: [
                        {
                            type: "reasoning",
                            summary: [
                                {
                                    type: "summary_text",
                                    text: "Reasoning summary",
                                },
                            ],
                        },
                        {
                            type: "message",
                            role: "assistant",
                            content: [
                                { type: "output_text", text: "Final answer" },
                            ],
                        },
                    ],
                    output_text: "Final answer",
                    usage: {
                        input_tokens: 54,
                        output_tokens: 96,
                        output_tokens_details: { reasoning_tokens: 89 },
                        total_tokens: 150,
                    },
                });
            },
        );

        const response = await generateResponsePortkey(
            {
                model: "openai-large",
                input: "test prompt",
                reasoning: { effort: "high", summary: "auto" },
                stream: false,
                store: false,
                safe: "false",
            },
            { portkeyGatewayUrl: "https://portkey.test" },
        );

        await expect(response.json()).resolves.toMatchObject({
            object: "response",
            output_text: "Final answer",
        });
        expect(upstreamRequest?.url).toBe("https://portkey.test/v1/responses");
        expect(upstreamRequest?.headers.get("x-portkey-provider")).toBe(
            "azure-openai",
        );
        expect(
            upstreamRequest?.headers.get("x-portkey-azure-api-version"),
        ).toBe("v1");
        await expect(upstreamRequest?.json()).resolves.toMatchObject({
            model: "gpt-5.5",
            input: "test prompt",
            reasoning: { effort: "high", summary: "auto" },
            store: false,
        });
    });

    it.each([
        "gemma",
        "unregistered-model",
    ])("rejects unsupported Responses API model %s", async (model) => {
        await expect(
            generateResponsePortkey(
                {
                    model,
                    input: "test prompt",
                    stream: false,
                    store: false,
                    safe: "false",
                },
                { portkeyGatewayUrl: "https://portkey.test" },
            ),
        ).rejects.toMatchObject({
            status: 400,
            details: {
                error: {
                    code: "unsupported_endpoint",
                    param: "model",
                },
            },
        });
    });

    it("forwards streaming Responses API bodies without buffering", async () => {
        process.env.AZURE_MYCELI_PROD_API_KEY = "test-azure-key";
        let upstreamRequest: Request | undefined;
        const event = {
            type: "response.output_text.delta",
            delta: "hello",
        };

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                upstreamRequest = new Request(input, init);
                return new Response(`data: ${JSON.stringify(event)}\n\n`, {
                    headers: { "content-type": "text/event-stream" },
                });
            },
        );

        const response = await generateResponsePortkey(
            {
                model: "openai-large",
                input: "test prompt",
                stream: true,
                store: false,
                safe: "false",
            },
            { portkeyGatewayUrl: "https://portkey.test" },
        );

        expect(response.headers.get("content-type")).toBe("text/event-stream");
        await expect(response.text()).resolves.toBe(
            `data: ${JSON.stringify(event)}\n\n`,
        );
        await expect(upstreamRequest?.json()).resolves.toMatchObject({
            model: "gpt-5.5",
            input: "test prompt",
            stream: true,
            store: false,
        });
    });
});
