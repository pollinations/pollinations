import { parseCommunityRealtimeUsage } from "@shared/realtime.ts";
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
    testCommunityRealtimeEndpoint,
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
    it.each([true, false])(
        "probes Responses JSON and SSE at the exact URL (data type: %s)",
        async (includeType) => {
            const usage = {
                input_tokens: 12,
                output_tokens: 3,
                total_tokens: 15,
                input_tokens_details: {
                    cached_tokens: 4,
                    cache_write_tokens: 2,
                },
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
        },
    );

    it.each(["responses", "chat_completions"] as const)(
        "rejects %s streams with missing or malformed usage",
        async (api) => {
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
                                          choices: [
                                              { message: { content: "OK" } },
                                          ],
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
                            {
                                headers: {
                                    "content-type": "text/event-stream",
                                },
                            },
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
        },
    );

    it.each(["responses", "chat_completions"] as const)(
        "rejects a %s streaming probe with the wrong content type",
        async (api) => {
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
        },
    );

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

    describe("endpoints without SSE", () => {
        const chatJson = {
            choices: [{ message: { role: "assistant", content: "OK" } }],
            usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        };
        const responseJson = {
            id: "resp_1",
            object: "response",
            model: "test-model",
            status: "completed",
            output: [],
            usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 },
        };
        const jsonFor = { chat_completions: chatJson, responses: responseJson };
        const probe = (api: "chat_completions" | "responses") =>
            testCommunityEndpoint({
                api,
                url: "https://api.example.com/v1/infer",
                bearerToken: "test-provider-token",
                model: "test-model",
            });

        it.each(["chat_completions", "responses"] as const)(
            "registers a %s endpoint that answers stream: true with JSON",
            async (api) => {
                const fetchMock = vi.fn(async () =>
                    Response.json(jsonFor[api]),
                );
                vi.stubGlobal("fetch", fetchMock);

                const result = await probe(api);

                expect(result).toMatchObject({
                    usage: jsonFor[api].usage,
                    streaming: false,
                    streamingError:
                        "Endpoint did not return a text/event-stream response",
                });
                expect(fetchMock).toHaveBeenCalledTimes(2);
            },
        );

        it.each([400, 422])(
            "registers an endpoint that rejects stream: true with %i",
            async (status) => {
                vi.stubGlobal(
                    "fetch",
                    vi.fn(async (_input, init) =>
                        JSON.parse(init.body).stream
                            ? Response.json(
                                  {
                                      error: {
                                          message: "stream not supported",
                                      },
                                  },
                                  { status },
                              )
                            : Response.json(chatJson),
                    ),
                );

                await expect(probe("chat_completions")).resolves.toMatchObject({
                    streaming: false,
                    streamingError: `Endpoint responded ${status}: stream not supported`,
                });
            },
        );

        it.each([401, 429, 500])(
            "still fails when the streaming request returns %i",
            async (status) => {
                vi.stubGlobal(
                    "fetch",
                    vi.fn(async (_input, init) =>
                        JSON.parse(init.body).stream
                            ? Response.json({}, { status })
                            : Response.json(chatJson),
                    ),
                );

                await expect(probe("chat_completions")).rejects.toThrow(
                    `Endpoint responded ${status}`,
                );
            },
        );

        it("still requires terminal usage from an endpoint that streams", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (_input, init) =>
                    JSON.parse(init.body).stream
                        ? new Response(
                              'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',
                              {
                                  headers: {
                                      "content-type": "text/event-stream",
                                  },
                              },
                          )
                        : Response.json(chatJson),
                ),
            );

            await expect(probe("chat_completions")).rejects.toThrow(
                "Endpoint omitted valid terminal streaming usage",
            );
        });

        it("stores the flag only as advertised.streaming: false", () => {
            const listing = {
                name: "test-model",
                title: "Test model",
                api: "chat_completions",
                url: "https://api.example.com/v1/chat/completions",
                bearerToken: "test-provider-token",
            };
            for (const [streaming, valid] of [
                [false, true],
                [true, false],
            ] as const) {
                expect(
                    CreateEndpointSchema.safeParse({
                        ...listing,
                        advertised: { streaming },
                    }).success,
                ).toBe(valid);
            }
        });
    });

    it("detects token billing when image endpoints return OpenAI usage", async () => {
        let editRequested = false;
        const fetchMock = vi.fn(async (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.endsWith("/images/edits")) {
                editRequested = true;
                const request = new Request(input, init);
                const form = await request.formData();
                expect(form.get("model")).toBe("gpt-image-1");
                expect(form.get("image")).toBeInstanceOf(File);
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

    it.each([
        [405, "Not supported"],
        [500, "Image edit failed"],
        [400, "Missing model parameter"],
        [429, "Quota exceeded"],
    ])(
        "preserves generation success and edit failure details for HTTP %i",
        async (status, message) => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (input) => {
                    if (String(input).endsWith("/images/edits")) {
                        return Response.json(
                            { error: { message } },
                            { status },
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
                imageEditError: `Endpoint responded ${status}: ${message}`,
            });
        },
    );

    it.each([
        ["missing image", { data: [] }],
        ["invalid image", { data: [{ b64_json: "bm90IGFuIGltYWdl" }] }],
    ])(
        "reports an editing response with %s without failing generation",
        async (_, editResponse) => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (input) =>
                    Response.json(
                        String(input).endsWith("/images/edits")
                            ? editResponse
                            : { data: [{ b64_json: "iVBORw0KGgo=" }] },
                    ),
                ),
            );
            await expect(
                testCommunityImageEndpoint({
                    baseUrl: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    model: "gpt-image-1",
                }),
            ).resolves.toMatchObject({
                billableUsage: { completionImageTokens: 1 },
                inputModalities: ["text"],
                imageEditError:
                    "Editing endpoint did not return a supported image",
            });
        },
    );

    it("preserves generation success when the edit request times out", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input) => {
                if (String(input).endsWith("/images/edits")) {
                    throw new DOMException("Probe timed out", "TimeoutError");
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
        ).resolves.toMatchObject({
            billableUsage: { completionImageTokens: 1 },
            inputModalities: ["text"],
            imageEditError: "Endpoint request timed out or could not connect",
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
                model: "black-forest-labs/flux.1-schnell",
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
                model: "black-forest-labs/flux.1-schnell",
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

    it("probes video generation and prefers reported usage over requested duration", async () => {
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
                usage: { duration: 4.5 },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            testCommunityVideoEndpoint({
                baseUrl: "https://api.example.com/generate-video?version=1",
                bearerToken: "sk_saved_token",
            }),
        ).resolves.toEqual({
            usage: { duration: 4.5 },
            billableUsage: { completionVideoSeconds: 4.5 },
        });
    });

    it.each([undefined, null, {}, { duration: null }])(
        "uses the probe duration when video usage is missing: %j",
        async (usage) => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () =>
                    Response.json({
                        data: [
                            {
                                b64_json:
                                    "AAAAFGZ0eXBpc29tAAAAAGlzb20AAAAJbWRhdAA=",
                            },
                        ],
                        usage,
                    }),
                ),
            );
            await expect(
                testCommunityVideoEndpoint({
                    baseUrl: "https://api.example.com/generate-video",
                    bearerToken: "sk_saved_token",
                }),
            ).resolves.toEqual({
                usage: { duration: 5 },
                billableUsage: { completionVideoSeconds: 5 },
            });
        },
    );

    it.each([{ duration: 0 }, { duration: -1 }, { duration: "5" }])(
        "rejects registration when reported video usage is invalid: %j",
        async (usage) => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () =>
                    Response.json({
                        data: [
                            {
                                b64_json:
                                    "AAAAFGZ0eXBpc29tAAAAAGlzb20AAAAJbWRhdAA=",
                            },
                        ],
                        usage,
                    }),
                ),
            );
            await expect(
                testCommunityVideoEndpoint({
                    baseUrl: "https://api.example.com/generate-video",
                    bearerToken: "sk_saved_token",
                }),
            ).rejects.toThrow("usage.duration");
        },
    );

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

describe("community realtime probe", () => {
    const input = {
        baseUrl: "https://voice.example.com/v1/realtime?version=1",
        bearerToken: "provider-token",
        model: "provider-voice",
    };
    const usage = {
        input_tokens: 10,
        output_tokens: 5,
        input_token_details: { text_tokens: 2, audio_tokens: 8 },
        output_token_details: { text_tokens: 1, audio_tokens: 4 },
    };

    it.each([
        "success",
        "no-audio",
        "bad-usage",
        "bad-audio",
        "error",
        "closed",
    ])("requires a completed voice exchange: %s", async (mode) => {
        const received: Record<string, unknown>[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url, init) => {
                const request = new Request(url, init);
                expect(request.url).toBe(
                    "https://voice.example.com/v1/realtime?version=1&model=provider-voice",
                );
                expect([...request.headers.entries()]).toEqual([
                    ["authorization", "Bearer provider-token"],
                    ["upgrade", "websocket"],
                ]);
                expect(init.redirect).toBe("manual");
                const [client, server] = Object.values(new WebSocketPair());
                server.accept();
                server.addEventListener("close", () => server.close());
                server.addEventListener("message", (message) => {
                    const event = JSON.parse(message.data as string);
                    received.push(event);
                    if (event.type === "session.update") {
                        expect(event.session).toMatchObject({
                            type: "realtime",
                            output_modalities: ["audio"],
                            audio: {
                                input: {
                                    format: { type: "audio/pcm", rate: 24000 },
                                    turn_detection: null,
                                },
                            },
                        });
                        server.send(
                            JSON.stringify({ type: "session.updated" }),
                        );
                    } else if (event.type === "input_audio_buffer.append") {
                        const pcm = atob(event.audio);
                        expect(pcm.length).toBeGreaterThan(24000);
                        expect(pcm.length % 2).toBe(0);
                        expect(pcm.slice(0, 4)).not.toBe("RIFF");
                    } else if (event.type === "response.create") {
                        if (mode === "closed") {
                            server.close();
                            return;
                        }
                        if (mode === "error") {
                            server.send(JSON.stringify({ type: "error" }));
                            return;
                        }
                        if (mode !== "no-audio")
                            server.send(
                                JSON.stringify({
                                    type: "response.output_audio.delta",
                                    delta:
                                        mode === "bad-audio"
                                            ? btoa("x")
                                            : btoa("\0\0".repeat(24)),
                                }),
                            );
                        server.send(
                            JSON.stringify({
                                type: "response.done",
                                response: {
                                    status: "completed",
                                    usage:
                                        mode === "bad-usage"
                                            ? {
                                                  input_tokens: 10,
                                                  output_tokens: 5,
                                              }
                                            : usage,
                                },
                            }),
                        );
                    }
                });
                server.send(JSON.stringify({ type: "session.created" }));
                return new Response(null, { status: 101, webSocket: client });
            }),
        );
        const probe = testCommunityRealtimeEndpoint(input);
        if (mode === "success") {
            await expect(probe).resolves.toMatchObject({
                billableUsage: {
                    promptTextTokens: 2,
                    promptAudioTokens: 8,
                    completionTextTokens: 1,
                    completionAudioTokens: 4,
                },
                inputModalities: ["text", "audio"],
            });
        } else await expect(probe).rejects.toThrow(/Realtime endpoint/);
        expect(received.map((event) => event.type)).toEqual([
            "session.update",
            "input_audio_buffer.append",
            "input_audio_buffer.commit",
            "response.create",
        ]);
    });

    it.each([302, 401, 503])(
        "rejects HTTP %s without following redirects",
        async (status) => {
            const fetchMock = vi.fn(
                async () => new Response("Provider failure", { status }),
            );
            vi.stubGlobal("fetch", fetchMock);
            await expect(testCommunityRealtimeEndpoint(input)).rejects.toThrow(
                `HTTP ${status}`,
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );
});

describe("community realtime usage validation", () => {
    const usage = {
        input_tokens: 20,
        output_tokens: 10,
        input_token_details: {
            text_tokens: 10,
            audio_tokens: 10,
            cached_tokens: 6,
            cached_tokens_details: { text_tokens: 4, audio_tokens: 2 },
        },
        output_token_details: { text_tokens: 3, audio_tokens: 7 },
    };
    it("counts cached audio once at the shared cached-input rate", () => {
        expect(parseCommunityRealtimeUsage(usage)?.usage).toEqual({
            promptTextTokens: 6,
            promptAudioTokens: 8,
            promptCachedTokens: 6,
            completionTextTokens: 3,
            completionAudioTokens: 7,
        });
    });
    it.each([
        undefined,
        { input_tokens: 20, output_tokens: 10 },
        { ...usage, input_tokens: 19 },
        { ...usage, output_tokens: 9 },
        {
            ...usage,
            input_token_details: {
                ...usage.input_token_details,
                image_tokens: 1,
            },
        },
        {
            ...usage,
            input_token_details: {
                ...usage.input_token_details,
                cached_tokens_details: undefined,
            },
        },
        {
            ...usage,
            input_token_details: {
                ...usage.input_token_details,
                cached_tokens: 7,
            },
        },
        {
            ...usage,
            input_token_details: {
                ...usage.input_token_details,
                text_tokens: -1,
            },
        },
    ])("rejects incomplete or inconsistent usage %#", (input) => {
        expect(parseCommunityRealtimeUsage(input)).toBeNull();
    });
});
