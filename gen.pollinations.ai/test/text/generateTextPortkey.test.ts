import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";

const azureModelConfig = {
    provider: "azure-openai",
    "azure-api-key": "test-key",
    "azure-resource-name": "myceli-prod-eastus",
    "azure-deployment-id": "gpt-5.6-luna",
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("generateTextPortkey", () => {
    it("sets an owned request deadline below the public gateway limit", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                expect(headers.get("x-portkey-request-timeout")).toBe("290000");
                expect(headers.get("x-portkey-strict-open-ai-compliance")).toBe(
                    "false",
                );

                return Response.json({
                    model: "provider-model",
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

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: {
                    provider: "openai",
                    model: "provider-model",
                },
                portkeyGatewayUrl: "https://portkey.test",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });

    it("preserves seeded GPT-5.6 requests on Chat Completions", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "gpt-5.6-luna",
                    seed: 42,
                });
                return Response.json({
                    choices: [
                        {
                            message: { role: "assistant", content: "ok" },
                        },
                    ],
                });
            },
        );

        await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "gpt-5.6-luna",
                seed: 42,
                modelConfig: azureModelConfig,
                portkeyGatewayUrl: "https://portkey.test",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("routes an unseeded GPT-5.6 request through Azure Responses", async () => {
        const portkeyFetcher = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
                );
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "gpt-5.6-luna",
                });
                return Response.json({
                    id: "resp_1",
                    status: "completed",
                    output: [
                        {
                            type: "message",
                            content: [{ type: "output_text", text: "ok" }],
                        },
                    ],
                });
            });

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "gpt-5.6-luna",
                modelConfig: azureModelConfig,
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });

    it("uses Responses for seeded requests that require tools and reasoning", async () => {
        const portkeyFetcher = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (_input, init) => {
                const body = JSON.parse(String(init?.body));
                expect(body).toMatchObject({
                    model: "gpt-5.6-luna",
                    reasoning: { effort: "max" },
                    tools: [{ type: "function", name: "weather" }],
                });
                expect(body).not.toHaveProperty("seed");
                return Response.json({
                    id: "resp_2",
                    status: "completed",
                    output: [],
                });
            });

        await generateTextPortkey(
            [{ role: "user", content: "weather" }],
            {
                model: "gpt-5.6-luna",
                modelConfig: azureModelConfig,
                seed: 42,
                reasoning_effort: "max",
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "weather",
                            parameters: { type: "object" },
                        },
                    },
                ],
            },
            portkeyFetcher,
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(portkeyFetcher).not.toHaveBeenCalled();
    });
});
