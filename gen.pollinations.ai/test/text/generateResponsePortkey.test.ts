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
                    model: "gpt-5.4",
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
                safe: "false",
            },
            { portkeyGatewayUrl: "https://portkey.test" },
        );

        expect(response).toMatchObject({
            object: "response",
            output_text: "Final answer",
        });
        expect(upstreamRequest?.url).toBe("https://portkey.test/v1/responses");
        expect(upstreamRequest?.headers.get("x-portkey-provider")).toBe(
            "azure-openai",
        );
        expect(
            upstreamRequest?.headers.get("x-portkey-azure-api-version"),
        ).toBe("2025-03-01-preview");
        await expect(upstreamRequest?.json()).resolves.toMatchObject({
            model: "gpt-5.4",
            input: "test prompt",
            reasoning: { effort: "high", summary: "auto" },
            store: false,
        });
    });

    it("rejects models that are not marked Responses API capable", async () => {
        await expect(
            generateResponsePortkey(
                {
                    model: "gemma",
                    input: "test prompt",
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

    it("routes Mistral Small 4 Responses API requests through OpenRouter", async () => {
        let upstreamRequest: Request | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                upstreamRequest = new Request(input, init);
                return Response.json({
                    id: "resp_mistral",
                    object: "response",
                    model: "mistralai/mistral-small-2603",
                    output: [
                        {
                            type: "reasoning",
                            content: [
                                {
                                    type: "reasoning_text",
                                    text: "Reasoning trace",
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

        await generateResponsePortkey(
            {
                model: "mistral-4",
                input: "test prompt",
                reasoning: { effort: "high" },
                safe: "false",
            },
            { portkeyGatewayUrl: "https://portkey.test" },
        );

        expect(upstreamRequest?.headers.get("x-portkey-provider")).toBe(
            "openai",
        );
        expect(upstreamRequest?.headers.get("x-portkey-custom-host")).toBe(
            "https://openrouter.ai/api/v1",
        );
        expect(
            upstreamRequest?.headers.get("x-portkey-azure-api-version"),
        ).toBeNull();
        await expect(upstreamRequest?.json()).resolves.toMatchObject({
            model: "mistralai/mistral-small-2603",
            input: "test prompt",
            reasoning: { effort: "high" },
            store: false,
        });
    });
});
