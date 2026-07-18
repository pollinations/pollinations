import { afterEach, describe, expect, it, vi } from "vitest";
import {
    listCommunityEndpointModels,
    testCommunityEmbeddingEndpoint,
    testCommunityEndpoint,
    testCommunityImageEndpoint,
    testCommunitySpeechEndpoint,
    testCommunityTranscriptionEndpoint,
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

    it("bills OpenAI-compatible image endpoints once per image", async () => {
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
            usage: { images: 1 },
            billableUsage: { completionImageTokens: 1 },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts image endpoints without OpenAI token usage", async () => {
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
        ).resolves.toEqual({
            usage: { images: 1 },
            billableUsage: { completionImageTokens: 1 },
        });
    });

    it("accepts legacy OpenAI image URL responses", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input) => {
                const url = String(input);
                if (url === "http://api.example.com/assets/image.png") {
                    return new Response(
                        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
                        { headers: { "Content-Type": "image/png" } },
                    );
                }
                return Response.json({
                    data: [{ url: "http://api.example.com/assets/image.png" }],
                });
            }),
        );

        await expect(
            testCommunityImageEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "flux",
            }),
        ).resolves.toEqual({
            usage: { images: 1 },
            billableUsage: { completionImageTokens: 1 },
        });
    });

    it("rejects private image URLs returned by upstreams", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [{ url: "http://127.0.0.1/private.png" }],
                }),
            ),
        );

        await expect(
            testCommunityImageEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "flux",
            }),
        ).rejects.toThrow("unsafe image URL");
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
        ).rejects.toThrow("Endpoint did not return a supported image");
    });

    it("tests OpenAI-compatible embedding endpoints", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe("https://api.example.com/v1/embeddings");
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            await expect(request.json()).resolves.toEqual({
                model: "text-embedding-3-small",
                input: "A simple green sprout.",
                encoding_format: "float",
            });
            return Response.json({
                object: "list",
                data: [
                    {
                        object: "embedding",
                        embedding: [0.1, -0.2, 0.3],
                        index: 0,
                    },
                ],
                model: "text-embedding-3-small",
                usage: { prompt_tokens: 6, total_tokens: 6 },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityEmbeddingEndpoint({
                baseUrl: "https://api.example.com/v1/embeddings",
                bearerToken: "sk_saved_token",
                model: "text-embedding-3-small",
            }),
        ).resolves.toEqual({
            usage: { prompt_tokens: 6, total_tokens: 6 },
            billableUsage: { promptTextTokens: 6 },
        });
    });

    it("rejects inconsistent embedding usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    object: "list",
                    data: [
                        {
                            object: "embedding",
                            embedding: [0.1],
                            index: 0,
                        },
                    ],
                    usage: { prompt_tokens: 6, total_tokens: 7 },
                }),
            ),
        );

        await expect(
            testCommunityEmbeddingEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "text-embedding-3-small",
            }),
        ).rejects.toThrow(
            "Endpoint did not return billable OpenAI token usage",
        );
    });

    it("offers fixed pricing when embedding usage is absent", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    object: "list",
                    data: [
                        {
                            object: "embedding",
                            embedding: [0.1],
                            index: 0,
                        },
                    ],
                }),
            ),
        );

        await expect(
            testCommunityEmbeddingEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "text-embedding-3-small",
            }),
        ).resolves.toEqual({
            usage: { requests: 1 },
            billableUsage: { completionTextTokens: 1 },
        });
    });

    it("tests OpenAI-compatible speech endpoints", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe("https://api.example.com/v1/audio/speech");
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            await expect(request.json()).resolves.toEqual({
                model: "gpt-4o-mini-tts",
                input: "A simple green sprout.",
                voice: "alloy",
                response_format: "mp3",
            });
            return new Response(new Uint8Array([0x49, 0x44, 0x33]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunitySpeechEndpoint({
                baseUrl: "https://api.example.com/v1/audio/speech",
                bearerToken: "sk_saved_token",
                model: "gpt-4o-mini-tts",
            }),
        ).resolves.toEqual({
            usage: { requests: 1 },
            billableUsage: { completionAudioTokens: 1 },
        });
    });

    it("tests token-billed OpenAI-compatible transcription endpoints", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/v1/audio/transcriptions",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            const form = await request.formData();
            expect(form.get("model")).toBe("gpt-4o-transcribe");
            expect(form.get("response_format")).toBe("json");
            expect(form.get("file")).toBeInstanceOf(File);
            return Response.json({
                text: "Hello",
                usage: {
                    type: "tokens",
                    input_tokens: 20,
                    output_tokens: 3,
                    total_tokens: 23,
                    input_token_details: {
                        audio_tokens: 18,
                        text_tokens: 2,
                    },
                },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1/audio/transcriptions",
                bearerToken: "sk_saved_token",
                model: "gpt-4o-transcribe",
            }),
        ).resolves.toEqual({
            usage: {
                type: "tokens",
                input_tokens: 20,
                output_tokens: 3,
                total_tokens: 23,
                input_token_details: {
                    audio_tokens: 18,
                    text_tokens: 2,
                },
            },
            billableUsage: {
                promptTextTokens: 2,
                promptAudioTokens: 18,
                completionTextTokens: 3,
            },
        });
    });

    it("offers fixed pricing when transcription usage is absent", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ text: "hello" })),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).resolves.toEqual({
            usage: { requests: 1 },
            billableUsage: { completionAudioTokens: 1 },
        });
    });

    it("rejects inconsistent transcription token usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    text: "hello",
                    usage: {
                        type: "tokens",
                        input_tokens: 20,
                        output_tokens: 3,
                        total_tokens: 22,
                    },
                }),
            ),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "gpt-4o-transcribe",
            }),
        ).rejects.toThrow("invalid transcription token usage");
    });

    it("rejects invalid transcription responses", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({})),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).rejects.toThrow("OpenAI transcription");
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
