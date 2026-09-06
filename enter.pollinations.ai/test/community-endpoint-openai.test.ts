import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CreateEndpointAgentSchema,
    CreateEndpointSchema,
    TestEndpointSchema,
    UpdateEndpointSchema,
} from "../src/routes/community-endpoints/schemas.ts";
import {
    listCommunityEndpointModels,
    testCommunityEmbeddingEndpoint,
    testCommunityEndpoint,
    testCommunityImageEndpoint,
    testCommunitySpeechEndpoint,
    testCommunityTranscriptionEndpoint,
    testCommunityVideoEndpoint,
} from "../src/services/community-endpoint-openai.ts";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("community endpoint test input", () => {
    const endpoint = {
        baseUrl: "https://api.example.com/generate-video",
        bearerToken: "sk_saved_token",
    };

    it("does not require an upstream model for video", () => {
        expect(
            TestEndpointSchema.safeParse({ ...endpoint, modality: "video" })
                .success,
        ).toBe(true);
    });

    it("requires an upstream model for OpenAI-compatible modalities", () => {
        expect(TestEndpointSchema.safeParse(endpoint).success).toBe(false);
    });

    it("accepts exactly one selected text API and endpoint URL", () => {
        const text = {
            api: "responses",
            url: "https://api.example.com/custom/infer?version=1",
            bearerToken: "test-provider-token",
            model: "test-model",
        };
        expect(TestEndpointSchema.safeParse(text).success).toBe(true);
        expect(
            TestEndpointSchema.safeParse({ ...text, baseUrl: text.url })
                .success,
        ).toBe(false);
        expect(
            TestEndpointSchema.safeParse({ ...text, responsesUrl: text.url })
                .success,
        ).toBe(false);
        expect(
            TestEndpointSchema.safeParse({ ...text, api: undefined }).success,
        ).toBe(false);
        expect(
            TestEndpointSchema.safeParse({ ...text, modality: "image" })
                .success,
        ).toBe(false);

        const listing = {
            name: "test-model",
            title: "Test model",
            api: text.api,
            url: text.url,
        };
        expect(CreateEndpointAgentSchema.safeParse(listing).success).toBe(true);
        expect(
            CreateEndpointSchema.safeParse({
                ...listing,
                bearerToken: text.bearerToken,
            }).success,
        ).toBe(true);
        expect(
            CreateEndpointAgentSchema.safeParse({
                ...listing,
                baseUrl: text.url,
            }).success,
        ).toBe(false);
        expect(
            UpdateEndpointSchema.safeParse({ api: "chat_completions" }).success,
        ).toBe(false);
        expect(UpdateEndpointSchema.safeParse({ url: text.url }).success).toBe(
            false,
        );
        expect(
            UpdateEndpointSchema.safeParse({
                api: "chat_completions",
                url: text.url,
            }).success,
        ).toBe(true);
    });
});

describe("community endpoint OpenAI service", () => {
    it.each([
        true,
        false,
    ])("probes Responses JSON and SSE at the exact URL (data type: %s)", async (includeType) => {
        const usage = {
            input_tokens: 12,
            output_tokens: 3,
            total_tokens: 15,
            input_tokens_details: { cached_tokens: 4, cache_write_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 1 },
        };
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/custom/infer?version=1",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer test-provider-token",
            );
            const body = (await request.json()) as { stream: boolean };
            expect(body).toMatchObject({
                model: "test-model",
                input: "Reply with OK.",
                store: false,
            });
            expect(body).not.toHaveProperty("messages");
            const response = {
                id: "resp_1",
                object: "response",
                model: "test-model",
                status: "completed",
                output: [],
                usage,
            };
            return body.stream
                ? new Response(
                      `event: response.completed\ndata: ${JSON.stringify({ ...(includeType ? { type: "response.completed" } : {}), response })}\n\ndata: [DONE]\n\n`,
                      { headers: { "content-type": "text/event-stream" } },
                  )
                : Response.json(response);
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityEndpoint({
                api: "responses",
                url: "https://api.example.com/custom/infer?version=1",
                model: "test-model",
                bearerToken: "test-provider-token",
            }),
        ).resolves.toMatchObject({
            usage,
            billableUsage: {
                promptCachedTokens: 4,
                promptCacheWriteTokens: 2,
                completionReasoningTokens: 1,
            },
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        "responses",
        "chat_completions",
    ] as const)("rejects %s streams with missing or malformed usage", async (api) => {
        for (const usage of [
            undefined,
            { total_tokens: 3, input_tokens: "2", output_tokens: 1 },
            { prompt_tokens: -1, completion_tokens: 1, total_tokens: 0 },
        ]) {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (_input, init) => {
                    const { stream } = JSON.parse(init.body);
                    if (!stream)
                        return Response.json(
                            api === "responses"
                                ? {
                                      id: "resp_1",
                                      object: "response",
                                      model: "test-model",
                                      status: "completed",
                                      output: [],
                                      usage: {
                                          input_tokens: 2,
                                          output_tokens: 1,
                                          total_tokens: 3,
                                      },
                                  }
                                : {
                                      choices: [{ message: { content: "OK" } }],
                                      usage: {
                                          prompt_tokens: 2,
                                          completion_tokens: 1,
                                          total_tokens: 3,
                                      },
                                  },
                        );
                    const terminal =
                        api === "responses"
                            ? {
                                  type: "response.completed",
                                  response: { usage },
                              }
                            : { choices: [], usage };
                    return new Response(
                        `data: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`,
                        { headers: { "content-type": "text/event-stream" } },
                    );
                }),
            );
            await expect(
                testCommunityEndpoint({
                    api,
                    url: "https://api.example.com/infer",
                    model: "test-model",
                    bearerToken: "test-provider-token",
                }),
            ).rejects.toThrow("valid terminal streaming usage");
        }
    });

    it.each([
        "responses",
        "chat_completions",
    ] as const)("rejects a %s streaming probe with the wrong content type", async (api) => {
        const response = {
            id: "resp_1",
            object: "response",
            model: "test-model",
            status: "completed",
            output: [],
            choices: [{ message: { content: "OK" } }],
            usage: {
                input_tokens: 2,
                output_tokens: 1,
                prompt_tokens: 2,
                completion_tokens: 1,
                total_tokens: 3,
            },
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_input, init) => {
                const { stream } = JSON.parse(init.body);
                return stream
                    ? new Response(
                          `data: ${JSON.stringify({ type: "response.completed", response, usage: response.usage })}\n\ndata: [DONE]\n\n`,
                      )
                    : Response.json(response);
            }),
        );
        await expect(
            testCommunityEndpoint({
                api,
                url: "https://api.example.com/infer",
                model: "test-model",
                bearerToken: "test-provider-token",
            }),
        ).rejects.toThrow("text/event-stream");
    });

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

    it("preserves endpoint query strings when building the models URL", async () => {
        const fetchMock = vi.fn(async (input) => {
            expect(String(input)).toBe(
                "https://api.example.com/v1/models?api-version=2026-08-01",
            );
            return Response.json({ data: [{ id: "gpt-4.1" }] });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            listCommunityEndpointModels({
                baseUrl: "https://api.example.com/v1/?api-version=2026-08-01",
                bearerToken: "sk_saved_token",
            }),
        ).resolves.toEqual(["gpt-4.1"]);
    });

    it("bounds model-list responses before parsing provider JSON", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response("{}", {
                        headers: { "content-length": "999999999" },
                    }),
            ),
        );

        await expect(
            listCommunityEndpointModels({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
            }),
        ).rejects.toThrow("Endpoint response is too large");
    });

    it("sends the bearer token when testing an endpoint", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (request.url.endsWith("/images/edits")) {
                return Response.json({
                    data: [{ b64_json: "iVBORw0KGgo=" }],
                });
            }
            expect(request.url).toBe(
                "https://api.example.com/v1/chat/completions",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            const body = (await request.json()) as { stream: boolean };
            expect(body).toMatchObject({
                model: "gpt-4.1-mini",
                messages: [{ role: "user", content: "Reply with OK." }],
            });
            if (body.stream) {
                expect(body).toHaveProperty(
                    "stream_options.include_usage",
                    true,
                );
                return new Response(
                    'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":1,"total_tokens":5}}\n\ndata: [DONE]\n\n',
                    { headers: { "content-type": "text/event-stream" } },
                );
            }
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
                api: "chat_completions",
                url: "https://api.example.com/v1/chat/completions",
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
                promptVideoTokens: 0,
                completionTextTokens: 1,
                completionAudioTokens: 0,
                completionImageTokens: 0,
                completionReasoningTokens: 0,
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("detects token billing when image endpoints return OpenAI usage", async () => {
        let editRequested = false;
        const fetchMock = vi.fn(async (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.endsWith("/images/edits")) {
                editRequested = true;
                return Response.json({
                    data: [{ b64_json: "iVBORw0KGgo=" }],
                });
            }
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
            imagePricing: "tokens",
            inputModalities: ["text", "image"],
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(editRequested).toBe(true);
    });

    it("accepts generation-only image endpoints without OpenAI token usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input) => {
                if (String(input).endsWith("/images/edits")) {
                    return Response.json(
                        { error: { message: "Not supported" } },
                        { status: 405 },
                    );
                }
                return Response.json({
                    data: [{ b64_json: "iVBORw0KGgo=" }],
                });
            }),
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
            imagePricing: "request",
            inputModalities: ["text"],
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
            imagePricing: "request",
            inputModalities: ["text", "image"],
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
                api: "chat_completions",
                url: "https://api.example.com/v1/chat/completions",
                bearerToken: "sk_saved_token",
                model: "gpt-4.1-mini",
            }),
        ).rejects.toThrow(
            "Endpoint responded 401 after we sent Authorization: Authentication required",
        );
    });

    it("probes the exact synchronous video endpoint", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/generate-video?version=1",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            await expect(request.json()).resolves.toEqual({
                prompt: "A green sprout gently moving in the breeze.",
                duration: 5,
            });
            return Response.json({
                data: [
                    {
                        b64_json: "AAAAFGZ0eXBpc29tAAAAAGlzb20AAAAJbWRhdAA=",
                    },
                ],
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityVideoEndpoint({
                baseUrl: "https://api.example.com/generate-video?version=1",
                bearerToken: "sk_saved_token",
            }),
        ).resolves.toEqual({
            usage: { duration: 5 },
            billableUsage: { completionVideoSeconds: 5 },
        });
    });

    it("probes transcription endpoints with a sample audio file and OpenAI duration usage", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe(
                "https://api.example.com/v1/audio/transcriptions",
            );
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            const formData = await request.formData();
            expect(formData.get("model")).toBe("whisper-1");
            expect(formData.get("response_format")).toBe("verbose_json");
            const file = formData.get("file");
            expect(file).toBeInstanceOf(File);
            expect((file as File).type).toBe("audio/wav");
            // A structurally valid WAV carrying actual speech: 44-byte
            // RIFF/WAVE header + ~0.9s of PCM at 8 kHz mono 16-bit. The
            // non-silence assertion is the point — probing with silence would
            // reject endpoints that legitimately report no duration for it.
            const wav = new Uint8Array(await (file as File).arrayBuffer());
            expect(wav.length).toBe(14518);
            expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
            expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
            expect(wav.subarray(44).some((byte) => byte !== 0)).toBe(true);
            return Response.json({
                text: "Hello",
                usage: { duration: 0.5 },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "Bearer sk_saved_token",
                model: "whisper-1",
            }),
        ).resolves.toEqual({
            usage: { duration: 0.5 },
            billableUsage: { promptAudioSeconds: 0.5 },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts whisper-style usage.seconds from transcription upstreams", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    text: "Hello",
                    usage: { seconds: 3 },
                }),
            ),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).resolves.toEqual({
            usage: { duration: 3 },
            billableUsage: { promptAudioSeconds: 3 },
        });
    });

    it("accepts a top-level duration, which is where whisper verbose_json puts it", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ text: "Hello", duration: 4.5 })),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).resolves.toMatchObject({
            billableUsage: { promptAudioSeconds: 4.5 },
        });
    });

    it("refuses to register a transcription endpoint that omits duration", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ text: "Hello" })),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).rejects.toThrow("did not report the audio duration");
    });

    it("rejects an empty transcript, since the sample is real speech", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ text: "   ", duration: 0.9 })),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "whisper-1",
            }),
        ).rejects.toThrow("did not return OpenAI transcription text");
    });

    it("explains the verbose_json requirement when the endpoint rejects it", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { error: { message: "unsupported response_format" } },
                    { status: 400 },
                ),
            ),
        );

        await expect(
            testCommunityTranscriptionEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "gpt-4o-transcribe",
            }),
        ).rejects.toThrow("response_format=verbose_json");
    });

    it("rejects transcription responses without text", async () => {
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
        ).rejects.toThrow("Endpoint did not return OpenAI transcription text");
    });

    it("probes speech endpoints with a standard OpenAI TTS request", async () => {
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            expect(request.url).toBe("https://api.example.com/v1/audio/speech");
            expect(request.headers.get("authorization")).toBe(
                "Bearer sk_saved_token",
            );
            await expect(request.json()).resolves.toEqual({
                model: "kokoro-1",
                input: "Pollinations speech endpoint test.",
                voice: "alloy",
                response_format: "mp3",
            });
            return new Response(new Uint8Array([73, 68, 51, 3, 4, 0, 0, 0]), {
                headers: { "Content-Type": "audio/mpeg" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunitySpeechEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "Bearer sk_saved_token",
                model: "kokoro-1",
            }),
        ).resolves.toEqual({
            // The probe meters the request text it sent: 34 code points.
            usage: { completionAudioTokens: 34 },
            billableUsage: { completionAudioTokens: 34 },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects speech upstreams that answer without binary audio", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({ data: [{ b64_json: "aGVsbG8=" }] }),
            ),
        );

        await expect(
            testCommunitySpeechEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "kokoro-1",
            }),
        ).rejects.toThrow(
            "Endpoint did not return binary audio (expected an audio/* response body)",
        );
    });

    it("rejects empty speech audio, since the sample is real text", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(new Uint8Array(0), {
                        headers: { "Content-Type": "audio/mpeg" },
                    }),
            ),
        );

        await expect(
            testCommunitySpeechEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "sk_saved_token",
                model: "kokoro-1",
            }),
        ).rejects.toThrow(
            "Endpoint did not return binary audio (expected an audio/* response body)",
        );
    });

    it("probes embedding endpoints and returns billable prompt tokens", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [
                        {
                            embedding: Array.from({ length: 4 }, () =>
                                Math.random(),
                            ),
                        },
                    ],
                    usage: { prompt_tokens: 12, total_tokens: 12 },
                }),
            ),
        );

        await expect(
            testCommunityEmbeddingEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "Bearer sk_saved_token",
                model: "text-embedding-3-small",
            }),
        ).resolves.toEqual({
            usage: { prompt_tokens: 12, total_tokens: 12 },
            billableUsage: { promptTextTokens: 12 },
        });
    });

    it("rejects embedding upstreams that omit billable token usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [
                        {
                            embedding: Array.from({ length: 4 }, () =>
                                Math.random(),
                            ),
                        },
                    ],
                }),
            ),
        );

        await expect(
            testCommunityEmbeddingEndpoint({
                baseUrl: "https://api.example.com/v1",
                bearerToken: "Bearer sk_saved_token",
                model: "text-embedding-3-small",
            }),
        ).rejects.toThrow(
            "Endpoint did not return billable OpenAI token usage",
        );
    });
});
