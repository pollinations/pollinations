import { afterEach, describe, expect, it, vi } from "vitest";
import {
    listCommunityEndpointModels,
    testCommunityEndpoint,
    testCommunityImageEndpoint,
} from "../src/services/community-endpoint-openai.ts";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("community endpoint OpenAI service", () => {
    it("fetches model lists with Authorization", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe("https://api.example.com/v1/models");
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            return Response.json({
                data: [{ id: "gpt-4.1-mini" }, { id: "gpt-4.1" }],
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            listCommunityEndpointModels({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
            }),
        ).resolves.toEqual(["gpt-4.1", "gpt-4.1-mini"]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends the bearer token when testing an endpoint", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/v1/chat/completions",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            await expect(request.json()).resolves.toMatchObject({
                model: "gpt-4.1-mini",
                messages: [{ role: "user", content: "Reply with OK." }],
                stream: false,
            });
            return Response.json({
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "OK" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 1,
                    total_tokens: 5,
                },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "Bearer sk_saved_token",
                model: "gpt-4.1-mini",
            }),
        ).resolves.toEqual({
            usage: {
                prompt_tokens: 4,
                completion_tokens: 1,
                total_tokens: 5,
            },
            billableUsage: {
                promptTextTokens: 4,
                promptCachedTokens: 0,
                promptCacheWriteTokens: 0,
                promptAudioTokens: 0,
                promptImageTokens: 0,
                completionTextTokens: 1,
                completionAudioTokens: 0,
                completionReasoningTokens: 0,
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("tests OpenAI-compatible image generation endpoints", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/v1/images/generations",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            const body = await request.json();
            expect(body).toMatchObject({
                model: "gpt-image-1",
                prompt: "A simple green sprout icon on a white background.",
                n: 1,
                size: "1024x1024",
                quality: "medium",
            });
            expect(body).not.toHaveProperty("response_format");
            return Response.json({
                data: [{ b64_json: "iVBORw0KGgo=" }],
                usage: {
                    input_tokens: 12,
                    output_tokens: 1056,
                    total_tokens: 1068,
                    input_tokens_details: {
                        text_tokens: 12,
                        image_tokens: 0,
                    },
                },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityImageEndpoint({
                baseUrl: "https://api.example.com/v1/images/generations",
                bearerToken: "Bearer sk_saved_token",
                model: "gpt-image-1",
            }),
        ).resolves.toEqual({
            usage: {
                input_tokens: 12,
                output_tokens: 1056,
                total_tokens: 1068,
                input_tokens_details: {
                    text_tokens: 12,
                    image_tokens: 0,
                },
            },
            billableUsage: {
                promptTextTokens: 12,
                promptImageTokens: 0,
                completionImageTokens: 1056,
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects image endpoints without OpenAI token usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [{ b64_json: "iVBORw0KGgo=" }],
                }),
            ),
        );

        await expect(
            testCommunityImageEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "gpt-image-1",
            }),
        ).rejects.toThrow("Endpoint did not return OpenAI image token usage");
    });

    it("rejects base64 that is not an image", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [{ b64_json: "bm90IGFuIGltYWdl" }],
                    usage: {
                        input_tokens: 12,
                        output_tokens: 1056,
                        total_tokens: 1068,
                        input_tokens_details: {
                            text_tokens: 12,
                            image_tokens: 0,
                        },
                    },
                }),
            ),
        );

        await expect(
            testCommunityImageEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "gpt-image-1",
            }),
        ).rejects.toThrow("Endpoint did not return a supported base64 image");
    });

    it("clarifies upstream 401s after sending Authorization", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_input, init) => {
                expect(new Headers(init?.headers).get("authorization")).toBe(
                    "Bearer sk_saved_token",
                );
                return Response.json(
                    { error: { message: "Authentication required" } },
                    { status: 401 },
                );
            }),
        );

        await expect(
            testCommunityEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "gpt-4.1-mini",
            }),
        ).rejects.toThrow(
            "Endpoint responded 401 after we sent Authorization: Authentication required",
        );
    });
});
