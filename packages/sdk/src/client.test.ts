import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import {
    chat,
    configure,
    embeddings,
    generateAudio,
    generateImage,
    generateText,
    generateVideo,
    getModels,
    resetClient,
} from "./helpers.js";
import type { EmbeddingInput } from "./index.js";
import { PollinationsError } from "./types.js";

// Build a minimal Response-like object good enough for the client paths.
function makeResponse(
    body: unknown,
    init: {
        ok?: boolean;
        status?: number;
        contentType?: string;
        kind?: "json" | "binary" | "stream";
        headers?: Record<string, string>;
    } = {},
): Response {
    const {
        ok = true,
        status = 200,
        contentType = "application/json",
        kind = "json",
        headers = {},
    } = init;

    const headerMap = new Map<string, string>(
        Object.entries({ "content-type": contentType, ...headers }).map(
            ([k, v]) => [k.toLowerCase(), v],
        ),
    );

    const resp: Record<string, unknown> = {
        ok,
        status,
        headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
        text: async () =>
            typeof body === "string" ? body : JSON.stringify(body),
        arrayBuffer: async () => new ArrayBuffer(8),
    };

    if (kind === "stream") {
        const encoder = new TextEncoder();
        const chunks = Array.isArray(body)
            ? body.map((chunk) => encoder.encode(String(chunk)))
            : typeof body === "string"
              ? [encoder.encode(body)]
              : [];
        let i = 0;
        resp.body = {
            getReader: () => ({
                read: async () =>
                    i < chunks.length
                        ? { done: false, value: chunks[i++] }
                        : { done: true, value: undefined },
                releaseLock: () => {},
                cancel: async () => {},
            }),
        };
    }

    return resp as unknown as Response;
}

function newClient() {
    return new Pollinations({
        apiKey: "sk_test",
        baseUrl: "https://example.test",
    });
}

const nativeFetch = globalThis.fetch;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    resetClient();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("Convenience helpers", () => {
    beforeEach(() => {
        configure({ apiKey: "sk_test", baseUrl: "https://example.test" });
    });

    it("makes one request per media helper without inventing a seed", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(null, {
                kind: "binary",
                contentType: "application/octet-stream",
            }),
        );

        await generateImage("a cat");
        await generateVideo("a cat running");
        await generateAudio("hello");

        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const [url] of fetchMock.mock.calls) {
            expect(new URL(url as string).searchParams.has("seed")).toBe(false);
        }
    });

    it.each([true, false])(
        "preserves text options and response metadata in raw mode (json: %s)",
        async (json) => {
            const response = {
                id: "chatcmpl-test",
                object: "chat.completion",
                created: 1,
                model: "actual-model",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: '{"ok":true}' },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 2,
                    completion_tokens: 3,
                    total_tokens: 5,
                },
            };
            fetchMock.mockResolvedValue(makeResponse(response));
            const options = {
                systemPrompt: "be concise",
                model: "openai",
                temperature: 0.5,
                maxTokens: 42,
                frequencyPenalty: 0.25,
                presencePenalty: -0.25,
                seed: -1,
                json,
                private: true,
            };

            await expect(generateText("hello", options)).resolves.toBe(
                '{"ok":true}',
            );
            await expect(
                generateText("hello", { ...options, raw: true }),
            ).resolves.toMatchObject({
                ...response,
                text: '{"ok":true}',
                tokens: { input: 2, output: 3, total: 5 },
                actualModel: "actual-model",
                requestId: "chatcmpl-test",
            });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            const expectedBody = {
                messages: [
                    { role: "system", content: "be concise" },
                    { role: "user", content: "hello" },
                ],
                model: "openai",
                temperature: 0.5,
                max_tokens: 42,
                frequency_penalty: 0.25,
                presence_penalty: -0.25,
                seed: -1,
                private: true,
                stream: false,
                ...(json ? { response_format: { type: "json_object" } } : {}),
            };
            expect(fetchMock.mock.calls.map(bodyOf)).toEqual([
                expectedBody,
                expectedBody,
            ]);
        },
    );

    it.each([false, true])(
        "rejects an empty text prompt before dispatch (raw: %s)",
        async (raw) => {
            fetchMock.mockResolvedValue(
                makeResponse({ choices: [{ message: { content: "ok" } }] }),
            );

            await expect(generateText("", { raw })).rejects.toMatchObject({
                code: "INVALID_INPUT",
                status: 400,
                message: "Prompt is required and must be a string",
            });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("makes one request per text helper without inventing a seed", async () => {
        const response = {
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 1,
            model: "test",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "ok" },
                    finish_reason: "stop",
                },
            ],
        };
        fetchMock.mockResolvedValue(makeResponse(response));

        await generateText("hello");
        await generateText("hello", { raw: true });
        await chat([{ role: "user", content: "hello" }]);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls.map((call) => bodyOf(call).seed)).toEqual([
            undefined,
            undefined,
            undefined,
        ]);
    });
});

// Helper: pull the seed query param from an image/video GET URL.
function seedFromUrl(url: string): string | null {
    return new URL(url).searchParams.get("seed");
}

// Helper: parse the JSON body of a POST fetch call.
function bodyOf(call: unknown[]): Record<string, unknown> {
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("Pollinations request attempts", () => {
    it.each([
        ["text", undefined],
        ["text", new Error("Caller cancelled")],
        ["chat", undefined],
        ["chat", new Error("Caller cancelled")],
    ] as const)(
        "%s rejects an already-aborted signal before dispatch (reason: %s)",
        async (method, reason) => {
            const client = newClient();
            const controller = new AbortController();
            controller.abort(reason);
            fetchMock.mockResolvedValue(
                makeResponse({
                    choices: [{ message: { content: "unexpected response" } }],
                }),
            );

            const options = { signal: controller.signal };
            const request =
                method === "text"
                    ? client.text("hello", options)
                    : client.chat(
                          [{ role: "user", content: "hello" }],
                          options,
                      );

            await expect(request).rejects.toBeInstanceOf(PollinationsError);
            await expect(request).rejects.toMatchObject({
                code: "CANCELLED",
                status: 499,
                message: "Request was cancelled",
            });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("cancels an in-flight request when the caller aborts", async () => {
        const controller = new AbortController();
        fetchMock.mockImplementation(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init.signal?.addEventListener("abort", () => {
                        reject(new DOMException("Aborted", "AbortError"));
                    });
                }),
        );

        const request = newClient().text("hello", {
            signal: controller.signal,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        controller.abort();

        await expect(request).rejects.toBeInstanceOf(PollinationsError);
        await expect(request).rejects.toMatchObject({
            code: "CANCELLED",
            status: 499,
            message: "Request was cancelled",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    for (const outcome of ["success", "http error", "parse error"] as const) {
        it(`cleans up cancellation and timeout after ${outcome}`, async () => {
            vi.useFakeTimers();
            const controller = new AbortController();
            const add = vi.spyOn(controller.signal, "addEventListener");
            const remove = vi.spyOn(controller.signal, "removeEventListener");
            fetchMock.mockResolvedValue(
                new Response(
                    outcome === "parse error"
                        ? "invalid json"
                        : JSON.stringify({ choices: [] }),
                    { status: outcome === "http error" ? 503 : 200 },
                ),
            );
            const request = newClient().chat(
                [{ role: "user", content: "test" }],
                { signal: controller.signal },
            );
            if (outcome === "success")
                await expect(request).resolves.toEqual({ choices: [] });
            else if (outcome === "http error")
                await expect(request).rejects.toMatchObject({ status: 503 });
            else await expect(request).rejects.toBeInstanceOf(SyntaxError);
            expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
            expect(vi.getTimerCount()).toBe(0);
            const requestSignal = fetchMock.mock.calls[0][1]
                .signal as AbortSignal;
            controller.abort();
            expect(requestSignal.aborted).toBe(false);
        });
    }

    it("does not turn the stream header timeout into a stream deadline", async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
                { kind: "stream" },
            ),
        );
        const client = new Pollinations({ apiKey: "local-test", timeout: 50 });
        const stream = client.chatStream([{ role: "user", content: "test" }]);
        await expect(stream.next()).resolves.toMatchObject({ done: false });
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        await expect(stream.next()).resolves.toMatchObject({ done: true });
    });

    it.each(["video", "model3d"] as const)(
        "keeps %s requests alive until the 20-minute default timeout",
        async (method) => {
            vi.useFakeTimers();
            let aborted = false;
            fetchMock.mockImplementation(
                (_url: string, init: RequestInit) =>
                    new Promise<Response>((_, reject) => {
                        init.signal?.addEventListener("abort", () => {
                            aborted = true;
                            reject(new DOMException("Aborted", "AbortError"));
                        });
                    }),
            );

            const request = newClient()[method]("a long-running scene");
            const assertion = expect(request).rejects.toMatchObject({
                code: "TIMEOUT",
                status: 408,
                message: "Request timed out after 1200000ms",
            });

            await vi.advanceTimersByTimeAsync(1_200_000 - 1);
            expect(aborted).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await assertion;
            expect(aborted).toBe(true);
        },
    );

    it("does not retry uploads after a network failure", async () => {
        const client = newClient();
        fetchMock.mockRejectedValue(new Error("boom"));

        await expect(client.upload(new ArrayBuffer(8))).rejects.toThrow("boom");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns API errors directly with server-provided Retry-After", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "slow down", code: "RATE_LIMITED" } },
                {
                    ok: false,
                    status: 429,
                    headers: { "Retry-After": "900" },
                },
            ),
        );

        await expect(client.image("a cat")).rejects.toMatchObject({
            code: "RATE_LIMITED",
            status: 429,
            retryAfter: 900,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not invent Retry-After when the header is absent", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "slow down", code: "RATE_LIMITED" } },
                { ok: false, status: 429 },
            ),
        );

        let error: PollinationsError | undefined;
        try {
            await client.image("a cat");
        } catch (caught) {
            if (caught instanceof PollinationsError) error = caught;
        }

        expect(error).toBeInstanceOf(PollinationsError);
        expect(error?.retryAfter).toBeUndefined();
    });
});

describe("Pollinations media upload", () => {
    it("serializes tags in the multipart request", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse({
                id: "media-id",
                url: "https://media.pollinations.ai/media-id",
                contentType: "image/png",
                size: 8,
                tags: ["cats", "gallery"],
            }),
        );

        const result = await client.upload(new ArrayBuffer(8), {
            contentType: "image/png",
            name: "cat.png",
            tags: ["cats", "gallery"],
        });

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const formData = request.body as FormData;
        expect(formData.get("tags")).toBe("cats,gallery");
        expect(result.tags).toEqual(["cats", "gallery"]);
    });

    it("keeps an uploaded file's name", async () => {
        fetchMock.mockResolvedValue(makeResponse({ id: "media-id" }));

        await newClient().upload(new File(["video"], "holiday.mp4"));

        const formData = fetchMock.mock.calls[0][1].body as FormData;
        expect((formData.get("file") as File).name).toBe("holiday.mp4");
    });
});

describe("audio inputs", () => {
    it("sends reference audio, duration and seed in the speech body", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(null, { contentType: "audio/mpeg" }),
        );
        const referenceAudio = "https://media.pollinations.ai/reference.wav";
        await newClient().audioSpeech("a melody", {
            model: "music-model",
            referenceAudio,
            duration: 3,
            seed: 42,
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            input: "a melody",
            model: "music-model",
            reference_audio: referenceAudio,
            duration: 3,
            seed: 42,
        });
    });

    it.each(["voice-changer", "voice-isolator"] as const)(
        "posts the original file to %s without a text prompt",
        async (operation) => {
            fetchMock.mockResolvedValue(
                makeResponse(null, { contentType: "audio/wav" }),
            );
            const file = new File(["sample audio"], "sample.wav", {
                type: "audio/wav",
            });
            const result = await newClient().audioTransform(file, {
                operation,
                model: "catalog-model",
                voice: "alloy",
            });
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(`https://example.test/v1/audio/${operation}`);
            expect(init.method).toBe("POST");
            expect(init.headers["Content-Type"]).toBeUndefined();
            expect(init.body.get("model")).toBe("catalog-model");
            expect(init.body.get("voice")).toBe(
                operation === "voice-changer" ? "alloy" : null,
            );
            const uploaded = init.body.get("audio") as File;
            expect(uploaded.name).toBe("sample.wav");
            expect(uploaded.type).toBe("audio/wav");
            expect(await uploaded.text()).toBe("sample audio");
            expect(result.contentType).toBe("audio/wav");
        },
    );
});

describe("Pollinations server-owned defaults", () => {
    it("omits unset models from URL requests", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(null, {
                kind: "binary",
                contentType: "application/octet-stream",
            }),
        );

        await client.image("a cat");
        await client.video("a cat running");

        expect(fetchMock).toHaveBeenCalledTimes(2);
        for (const [url] of fetchMock.mock.calls) {
            expect(new URL(url as string).searchParams.has("model")).toBe(
                false,
            );
        }
    });

    it("omits unset models from JSON requests", async () => {
        const client = newClient();
        const completion = {
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 1,
            model: "server-default",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "ok" },
                    finish_reason: "stop",
                },
            ],
        };
        const stream =
            'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n';
        fetchMock
            .mockResolvedValueOnce(
                makeResponse({ data: [{ b64_json: "AAAA" }] }),
            )
            .mockResolvedValueOnce(
                makeResponse({ data: [{ b64_json: "AAAA" }] }),
            )
            .mockResolvedValueOnce(makeResponse(completion))
            .mockResolvedValueOnce(
                makeResponse(stream, {
                    kind: "stream",
                    contentType: "text/event-stream",
                }),
            )
            .mockResolvedValueOnce(makeResponse(completion))
            .mockResolvedValueOnce(
                makeResponse(stream, {
                    kind: "stream",
                    contentType: "text/event-stream",
                }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "audio/mpeg",
                }),
            );

        await client.imageGenerate("a cat");
        await client.imageEdit("make it blue", {
            image: "https://example.test/cat.png",
        });
        await client.text("hello");
        for await (const _ of client.textStream("hello")) {
            // consume stream
        }
        await client.chat([{ role: "user", content: "hello" }]);
        for await (const _ of client.chatStream([
            { role: "user", content: "hello" },
        ])) {
            // consume stream
        }
        await client.audioSpeech("hello");

        expect(fetchMock).toHaveBeenCalledTimes(7);
        expect(fetchMock.mock.calls.map((call) => bodyOf(call).model)).toEqual(
            Array(7).fill(undefined),
        );
        expect(bodyOf(fetchMock.mock.calls[6]).voice).toBeUndefined();
    });

    it("omits an unset transcription model", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(makeResponse({ text: "hello" }));

        await client.transcribe(new ArrayBuffer(8));

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        expect((request.body as FormData).has("model")).toBe(false);
    });

    // Azure's gpt-transcribe rejects a WAV upload named audio.mp3.
    it("uses matching filenames for transcription uploads", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(makeResponse({ text: "hello" }));

        await client.transcribe(
            new File([new Uint8Array(8)], "clip.wav", { type: "audio/wav" }),
        );
        await client.transcribe(new ArrayBuffer(8));
        await client.transcribe(
            new Blob(["RIFF sample audio"], { type: "audio/wav" }),
        );
        await client.transcribe(
            new Blob(["WebM sample audio"], { type: "audio/webm;codecs=opus" }),
        );

        const files = fetchMock.mock.calls.map(
            ([, request]) =>
                ((request as RequestInit).body as FormData).get("file") as File,
        );
        expect(files.map((file) => file.name)).toEqual([
            "clip.wav",
            "audio.mp3",
            "audio.wav",
            "audio.webm",
        ]);
        expect(files.map((file) => file.type)).toEqual([
            "audio/wav",
            "audio/mpeg",
            "audio/wav",
            "audio/webm;codecs=opus",
        ]);
        expect(await files[2].text()).toBe("RIFF sample audio");
        expect(await files[3].text()).toBe("WebM sample audio");
    });
});

describe("Pollinations video reference media", () => {
    it.each([false, true])(
        "sends guidance URLs (arrays: %s)",
        async (arrays) => {
            const urls = [
                "https://media.example/ref,one?size=large&tag=a b",
                "https://media.example/ref-two",
            ];
            const references = arrays ? urls : urls[0];
            fetchMock.mockResolvedValue(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "video/mp4",
                }),
            );

            await newClient().video("a guided scene", {
                referenceImages: references,
                referenceVideos: references,
                referenceAudios: references,
                referenceImage: "https://media.example/start.png",
            });

            const [requestUrl] = fetchMock.mock.calls[0];
            const url = new URL(requestUrl as string);
            const expected = arrays ? urls.join("|") : urls[0];
            for (const name of [
                "reference_images",
                "reference_videos",
                "reference_audios",
            ]) {
                expect(url.searchParams.get(name)).toBe(expected);
            }
            expect(url.searchParams.get("image")).toBe(
                "https://media.example/start.png",
            );
            expect([...url.searchParams.keys()].sort()).toEqual([
                "image",
                "key",
                "reference_audios",
                "reference_images",
                "reference_videos",
            ]);
        },
    );

    it.each([
        undefined,
        "https://media.example/start.png",
        ["https://media.example/start.png", "https://media.example/end.png"],
    ])(
        "omits guidance and preserves frame images: %s",
        async (referenceImage) => {
            fetchMock.mockResolvedValue(makeResponse(null, { kind: "binary" }));
            await newClient().video("a scene", { referenceImage });

            const url = new URL(fetchMock.mock.calls[0][0] as string);
            expect(url.searchParams.get("image")).toBe(
                Array.isArray(referenceImage)
                    ? referenceImage.join("|")
                    : (referenceImage ?? null),
            );
            for (const name of [
                "reference_images",
                "reference_videos",
                "reference_audios",
            ]) {
                expect(url.searchParams.has(name)).toBe(false);
            }
        },
    );

    it("serializes multiple reference images using pipe delimiter for image generation", async () => {
        fetchMock.mockResolvedValue(makeResponse(null, { kind: "binary" }));
        const references = [
            "https://media.example/ref1.png?v=1",
            "https://media.example/ref2.png?v=2",
        ];
        await newClient().image("a scene", { referenceImage: references });

        const url = new URL(fetchMock.mock.calls[0][0] as string);
        expect(url.searchParams.get("image")).toBe(references.join("|"));
    });
});

describe("Pollinations seed handling", () => {
    it("passes seed and model-specific video duration through URL requests", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(null, {
                kind: "binary",
                contentType: "application/octet-stream",
            }),
        );

        await client.image("a cat", { seed: -1, resolution: "2k" });
        await client.video("a long scene", {
            model: "alibaba/wan-2.6",
            duration: 15,
            resolution: "1080p",
            seed: -1,
        });

        const imageUrl = new URL(fetchMock.mock.calls[0][0] as string);
        const videoUrl = new URL(fetchMock.mock.calls[1][0] as string);
        expect(seedFromUrl(imageUrl.toString())).toBe("-1");
        expect(imageUrl.searchParams.get("resolution")).toBe("2k");
        expect(videoUrl.searchParams.get("seed")).toBe("-1");
        expect(videoUrl.searchParams.get("duration")).toBe("15");
        expect(videoUrl.searchParams.get("resolution")).toBe("1080p");
    });

    it("passes seed through text and chat requests consistently", async () => {
        const client = newClient();
        const stream =
            'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n';
        fetchMock
            .mockResolvedValueOnce(
                makeResponse({ choices: [{ message: { content: "ok" } }] }),
            )
            .mockResolvedValueOnce(
                makeResponse(stream, {
                    kind: "stream",
                    contentType: "text/event-stream",
                }),
            )
            .mockResolvedValueOnce(
                makeResponse({ choices: [{ message: { content: "ok" } }] }),
            )
            .mockResolvedValueOnce(
                makeResponse(stream, {
                    kind: "stream",
                    contentType: "text/event-stream",
                }),
            );

        await client.text("hello", { seed: -1 });
        for await (const _ of client.textStream("hello", { seed: -1 })) {
            // consume stream
        }
        await client.chat([{ role: "user", content: "hi" }], { seed: -1 });
        for await (const _ of client.chatStream(
            [{ role: "user", content: "hi" }],
            { seed: -1 },
        )) {
            // consume stream
        }

        expect(fetchMock.mock.calls.map((call) => bodyOf(call).seed)).toEqual([
            -1, -1, -1, -1,
        ]);
    });

    it("chat() serializes the standard reasoning effort option", async () => {
        const client = newClient();

        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await client.chat([{ role: "user", content: "hi" }], {
            reasoningEffort: "medium",
        });

        const body = bodyOf(fetchMock.mock.calls[0]);
        expect(body.reasoning_effort).toBe("medium");
        expect("thinking" in body).toBe(false);
        expect("thinking_budget" in body).toBe(false);
    });
});

const EMBEDDINGS_RESPONSE = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, -0.2, 0.3], index: 0 }],
    model: "gemini-2",
    usage: { prompt_tokens: 2, total_tokens: 2 },
};

describe("Pollinations.embeddings", () => {
    it("posts an OpenAI-compatible request to /v1/embeddings", async () => {
        const response = {
            ...EMBEDDINGS_RESPONSE,
            data: [
                {
                    object: "embedding",
                    embedding: "zczMPc3MTL6amZk+",
                    index: 0,
                },
            ],
        };
        fetchMock.mockResolvedValue(makeResponse(response));

        const result = await newClient().embeddings("Hello world", {
            model: "gemini-2",
            dimensions: 768,
            encodingFormat: "base64",
            taskType: "RETRIEVAL_QUERY",
            inputType: "query",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://example.test/v1/embeddings");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer sk_test",
        );
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
            "application/json",
        );
        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            model: "gemini-2",
            input: "Hello world",
            dimensions: 768,
            encoding_format: "base64",
            task_type: "RETRIEVAL_QUERY",
            input_type: "query",
        });
        expect(result).toEqual(response);
        expect(result.usage.total_tokens).toBe(2);
    });

    it("accepts a batch of strings and omits unset options", async () => {
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        await newClient().embeddings(["first document", "second document"]);

        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            input: ["first document", "second document"],
        });
    });

    it("passes multimodal content parts and audio formats through unchanged", async () => {
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        const input: EmbeddingInput = [
            { type: "text" as const, text: "a photo of a cat" },
            {
                type: "image_url" as const,
                image_url: { url: "https://example.com/cat.jpg" },
            },
            {
                type: "input_audio",
                input_audio: { data: "YXVkaW8=", format: "ogg" },
            },
        ];
        await newClient().embeddings(input);

        expect(bodyOf(fetchMock.mock.calls[0]).input).toEqual(input);
    });

    it.each(["", []])(
        "rejects empty input %j without a request",
        async (input) => {
            await expect(newClient().embeddings(input)).rejects.toMatchObject({
                code: "INVALID_INPUT",
                status: 400,
            });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("surfaces API errors", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "Insufficient balance" } },
                { ok: false, status: 402 },
            ),
        );

        await expect(
            newClient().embeddings("Hello world"),
        ).rejects.toBeInstanceOf(PollinationsError);
    });
});

describe("embeddings helper", () => {
    it("uses the configured client", async () => {
        configure({ apiKey: "sk_test", baseUrl: "https://example.test" });
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        const result = await embeddings("Hello world");

        const [url] = fetchMock.mock.calls[0] as [string];
        expect(url).toBe("https://example.test/v1/embeddings");
        expect(result.model).toBe("gemini-2");
    });
});

describe("Pollinations chat routing", () => {
    it("serializes per-capability routing for chat requests", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await client.chat([{ role: "user", content: "hello" }], {
            model: "floret",
            routing: {
                text: "openai",
                web_search: "perplexity-fast",
                image_generation: "flux",
                image_editing: "nanobanana",
                video: "veo",
                audio: "elevenlabs",
            },
        });

        const body = bodyOf(fetchMock.mock.calls[0]);
        expect(body).toMatchObject({ model: "floret", stream: false });
        expect(body.metadata).toEqual({
            model: "openai",
            web_search: "perplexity-fast",
            image_generation: "flux",
            image_editing: "nanobanana",
            video: "veo",
            audio: "elevenlabs",
        });
        expect(body.routing).toBeUndefined();
    });

    it("serializes partial routing for streaming chat requests", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        for await (const _chunk of client.chatStream(
            [{ role: "user", content: "hello" }],
            {
                model: "floret",
                routing: { video: "veo" },
            },
        )) {
            // Consume the stream.
        }

        const body = bodyOf(fetchMock.mock.calls[0]);
        expect(body).toMatchObject({ model: "floret", stream: true });
        expect(body.metadata).toEqual({ video: "veo" });
        expect(body.routing).toBeUndefined();
    });

    it("omits routing when no override is provided", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await client.chat([{ role: "user", content: "hello" }], {
            model: "floret",
        });

        expect(bodyOf(fetchMock.mock.calls[0]).metadata).toBeUndefined();
    });
});

describe("Pollinations chat streaming", () => {
    it("passes request values and provider payloads through unchanged", async () => {
        const messages = [
            { role: "user" as const, content: "  keep this text  " },
        ];
        const routing = { text: "publisher/custom-model" };
        const payload = {
            model: "provider-reported-id",
            choices: [
                {
                    index: 0,
                    delta: {
                        content: "  answer  ",
                        reasoning: "provider detail",
                    },
                    finish_reason: "provider_finish",
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 2,
                total_tokens: 3,
                provider_cost: 0.123,
            },
            provider_metadata: { region: "example", nested: [0, false, null] },
        };
        fetchMock.mockResolvedValue(
            new Response(
                `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`,
            ),
        );
        const chunks = [];
        for await (const chunk of newClient().chatStream(messages, {
            model: "requested-alias",
            routing,
            seed: 0,
            temperature: 0,
        })) {
            chunks.push(chunk);
        }
        expect(chunks).toEqual([payload]);
        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            messages,
            model: "requested-alias",
            metadata: { model: "publisher/custom-model" },
            seed: 0,
            temperature: 0,
            stream: true,
        });
    });

    it.each(["\n", "\r", "\r\n"])(
        "preserves UTF-8 and tool/usage events split at every byte (%j)",
        async (newline) => {
            const events = [
                {
                    choices: [
                        {
                            index: 0,
                            delta: { content: "🌸 café" },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "call_1",
                                        type: "function",
                                        function: {
                                            name: "search",
                                            arguments: "{}",
                                        },
                                    },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                },
                {
                    choices: [],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                },
            ];
            const sse = events
                .map(
                    (event) =>
                        `data:${JSON.stringify(event)}${newline}${newline}`,
                )
                .join("");
            const bytes = new TextEncoder().encode(
                `${sse}data: [DONE]${newline}${newline}`,
            );
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const byte of bytes)
                        controller.enqueue(Uint8Array.of(byte));
                    controller.close();
                },
            });
            fetchMock.mockResolvedValue(new Response(body));

            const chunks = [];
            for await (const chunk of newClient().chatStream([
                { role: "user", content: "hello" },
            ])) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(events);
            expect(body.locked).toBe(false);
        },
    );

    it("rejects a chat stream that closes before completion instead of returning partial text", async () => {
        fetchMock.mockResolvedValue(
            new Response(
                'data: {"choices":[{"delta":{"content":"unfinished"},"finish_reason":null}]}\n\n',
                { headers: { "content-type": "text/event-stream" } },
            ),
        );

        const consume = async () => {
            for await (const _chunk of newClient().chatStream([
                { role: "user", content: "hello" },
            ])) {
                // Consume the stream through EOF.
            }
        };

        await expect(consume()).rejects.toMatchObject({
            name: "PollinationsError",
            code: "INCOMPLETE_STREAM",
            status: 502,
        });
    });

    it("discards an incomplete SSE event at EOF", async () => {
        const terminal = { choices: [{ delta: {}, finish_reason: "stop" }] };
        const event = { choices: [{ delta: { content: "last" } }] };
        fetchMock.mockResolvedValue(
            new Response(
                `data: ${JSON.stringify(terminal)}\n\ndata: ${JSON.stringify(event)}`,
            ),
        );

        const chunks = [];
        for await (const chunk of newClient().chatStream([
            { role: "user", content: "hello" },
        ])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual([terminal]);
    });

    it("does not guess event boundaries between complete JSON data lines", async () => {
        fetchMock.mockResolvedValue(
            new Response('data: {"choices":[]}\ndata: {"choices":[]}\n\n'),
        );

        await expect(
            newClient()
                .chatStream([{ role: "user", content: "hello" }])
                .next(),
        ).rejects.toMatchObject({ code: "MALFORMED_STREAM" });
    });

    it("cancels and releases the body when decoding fails", async () => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode("data: [invalid-json]\n\n"),
                );
            },
            cancel,
        });
        fetchMock.mockResolvedValue(new Response(body));

        await expect(
            newClient()
                .chatStream([{ role: "user", content: "hello" }])
                .next(),
        ).rejects.toMatchObject({ code: "MALFORMED_STREAM" });
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });

    it("decodes SSE across chunk boundaries and ignores comment lines", async () => {
        const client = newClient();
        const chunk = {
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: 1,
            model: "floret",
            choices: [
                {
                    index: 0,
                    delta: { content: "ready" },
                    finish_reason: null,
                },
            ],
        };
        const json = JSON.stringify(chunk);
        const split = json.indexOf(',"choices"') + 1;
        fetchMock.mockResolvedValue(
            makeResponse(
                [
                    ": keep-alive\r",
                    `\n: ping\r\n\r\ndata: ${json.slice(0, split)}\r\ndata:${json.slice(split)}\r\n\r\ndata:[DONE]\r\n\r\n`,
                ],
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        const chunks = [];
        for await (const chunk of client.chatStream([
            { role: "user", content: "transcribe this" },
        ])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual([chunk]);
    });

    it("ignores a repeated [DONE] instead of failing a complete response", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"choices":[{"index":0,"delta":{"content":"done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\ndata: [DONE]\n\n',
                { kind: "stream", contentType: "text/event-stream" },
            ),
        );

        const chunks = [];
        for await (const chunk of client.chatStream([
            { role: "user", content: "hello" },
        ])) {
            chunks.push(chunk);
        }

        expect(chunks).toHaveLength(1);
    });

    it("cancels the response body when the consumer stops early", async () => {
        const client = newClient();
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(
                        'data: {"choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}]}\n\n',
                    ),
                );
            },
            cancel() {
                cancelled = true;
            },
        });
        fetchMock.mockResolvedValue(
            new Response(body, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            }),
        );

        for await (const _chunk of client.chatStream([
            { role: "user", content: "hello" },
        ])) {
            break;
        }

        expect(cancelled).toBe(true);
    });

    it("surfaces stream errors instead of silently completing", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"error":{"message":"Agent failed"}}\n\ndata: [DONE]\n\n',
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        const consume = async () => {
            for await (const _chunk of client.chatStream([
                { role: "user", content: "hello" },
            ])) {
                // Consume the stream.
            }
        };

        await expect(consume()).rejects.toMatchObject({
            code: "STREAM_ERROR",
            message: "Agent failed",
        });
    });

    it("cancels an active response body when the caller aborts", async () => {
        const client = newClient();
        const encoder = new TextEncoder();
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: {"choices":[{"index":0,"delta":{"content":"started"},"finish_reason":null}]}\n\n',
                    ),
                );
            },
            cancel() {
                cancelled = true;
            },
        });
        fetchMock.mockResolvedValue(
            new Response(body, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            }),
        );
        const controller = new AbortController();
        const stream = client.chatStream([{ role: "user", content: "hello" }], {
            signal: controller.signal,
        });

        await expect(stream.next()).resolves.toMatchObject({
            value: { choices: [{ delta: { content: "started" } }] },
        });
        const pending = stream.next();
        controller.abort();

        await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
        expect(cancelled).toBe(true);
    });
});

describe("Pollinations simple text facade", () => {
    it("maps every simple text option to one canonical chat request", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await expect(
            client.text("hello", {
                systemPrompt: "be concise",
                model: "openai",
                temperature: 0.5,
                maxTokens: 42,
                frequencyPenalty: 0.25,
                presencePenalty: -0.25,
                seed: -1,
                json: true,
                private: true,
            }),
        ).resolves.toBe("ok");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            messages: [
                { role: "system", content: "be concise" },
                { role: "user", content: "hello" },
            ],
            model: "openai",
            temperature: 0.5,
            max_tokens: 42,
            frequency_penalty: 0.25,
            presence_penalty: -0.25,
            seed: -1,
            private: true,
            stream: false,
            response_format: { type: "json_object" },
        });
    });

    it("streams only text deltas through the canonical chat parser", async () => {
        const client = newClient();
        const stream = [
            'data: {"choices":[{"delta":{"role":"assistant"}}]}',
            'data: {"choices":[{"delta":{"content":"hello"}}]}',
            'data: {"choices":[{"delta":{"content":""}}]}',
            "data: [DONE]",
            "",
        ].join("\n\n");
        fetchMock.mockResolvedValue(
            makeResponse(stream, {
                kind: "stream",
                contentType: "text/event-stream",
            }),
        );

        const chunks: string[] = [];
        for await (const chunk of client.textStream("hello", {
            json: true,
            private: true,
        })) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["hello"]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({
            messages: [{ role: "user", content: "hello" }],
            stream: true,
            private: true,
            response_format: { type: "json_object" },
        });
    });

    it("surfaces streamed API errors instead of yielding invalid chunks", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                [
                    'data: {"error":{"message":"Upstream model unavailable"}}',
                    "data: [DONE]",
                    "",
                ].join("\n\n"),
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        const consume = async () => {
            for await (const _chunk of newClient().chatStream([
                { role: "user", content: "hello" },
            ])) {
                // Consume the stream.
            }
        };

        await expect(consume()).rejects.toMatchObject({
            name: "PollinationsError",
            code: "STREAM_ERROR",
            status: 502,
            message: "Upstream model unavailable",
        });
    });

    it("accepts successful stream events with a null error", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"error":null,"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
                { kind: "stream", contentType: "text/event-stream" },
            ),
        );
        const chunks: string[] = [];
        for await (const chunk of newClient().textStream("hello"))
            chunks.push(chunk);
        expect(chunks).toEqual(["hello"]);
    });

    it.each([
        [{ code: 400, message: "PROHIBITED_CONTENT" }, 400, "STREAM_ERROR"],
        [{ code: "429", message: "Rate limited" }, 429, "STREAM_ERROR"],
        [
            { code: "content_policy_violation", status: 422 },
            422,
            "content_policy_violation",
        ],
        [{ code: "usage_missing" }, 502, "usage_missing"],
        [{ code: 200 }, 502, "STREAM_ERROR"],
        [{ code: 600 }, 502, "STREAM_ERROR"],
        [{ code: 400.5 }, 502, "STREAM_ERROR"],
    ])(
        "preserves streamed error status and code: %j",
        async (error, status, code) => {
            fetchMock.mockResolvedValue(
                makeResponse(
                    `data: ${JSON.stringify({ error })}\n\ndata: [DONE]\n\n`,
                    { kind: "stream", contentType: "text/event-stream" },
                ),
            );
            const consume = async () => {
                for await (const _chunk of newClient().textStream("hello")) {
                    /* consume */
                }
            };
            await expect(consume()).rejects.toMatchObject({
                name: "PollinationsError",
                status,
                code,
            });
        },
    );

    it.each([undefined, null])(
        "rejects an error finish reason even with error=%s",
        async (error) => {
            fetchMock.mockResolvedValue(
                makeResponse(
                    `data: ${JSON.stringify({ error, choices: [{ delta: {}, finish_reason: "error" }] })}\n\ndata: [DONE]\n\n`,
                    { kind: "stream", contentType: "text/event-stream" },
                ),
            );
            const consume = async () => {
                for await (const _chunk of newClient().textStream("hello")) {
                    /* consume */
                }
            };
            await expect(consume()).rejects.toMatchObject({
                name: "PollinationsError",
                status: 502,
                code: "STREAM_ERROR",
            });
        },
    );

    it("rejects malformed stream events without choices", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                [
                    'data: {"provider_metadata":{"status":"ok"}}',
                    "data: [DONE]",
                    "",
                ].join("\n\n"),
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        const consume = async () => {
            for await (const _chunk of newClient().chatStream([
                { role: "user", content: "hello" },
            ])) {
                // Consume the stream.
            }
        };

        await expect(consume()).rejects.toMatchObject({
            name: "PollinationsError",
            code: "MALFORMED_STREAM",
            status: 502,
        });
    });

    it("rejects invalid JSON in a stream", async () => {
        fetchMock.mockResolvedValue(
            makeResponse("data: [invalid-json]\n\n", {
                kind: "stream",
                contentType: "text/event-stream",
            }),
        );

        const consume = async () => {
            for await (const _chunk of newClient().chatStream([
                { role: "user", content: "hello" },
            ])) {
                // Consume the stream.
            }
        };

        await expect(consume()).rejects.toMatchObject({
            name: "PollinationsError",
            code: "MALFORMED_STREAM",
            status: 502,
        });
    });
    it("stops at DONE without waiting for EOF or inspecting trailing data", async () => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(
                        'data: {"choices":[]}\n\ndata: [DONE]\n\ndata: [not-json]\n\n',
                    ),
                );
                // Deliberately leave the connection open.
            },
            cancel,
        });
        fetchMock.mockResolvedValue(new Response(body));
        const chunks = [];
        for await (const chunk of newClient().chatStream([
            { role: "user", content: "hello" },
        ])) {
            chunks.push(chunk);
        }
        expect(chunks).toEqual([{ choices: [] }]);
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });
});

describe("Pollinations.imageEdit — response resolution (characterization)", () => {
    it("maps an image array to the OpenAI { image_url } shape the edits endpoint accepts", async () => {
        const client = newClient();

        // "AAAA" base64 decodes to 3 zero bytes — no follow-up download.
        fetchMock.mockResolvedValueOnce(
            makeResponse({ data: [{ b64_json: "AAAA" }] }),
        );

        await client.imageEdit("combine these", {
            image: ["https://in.test/a.png", "https://in.test/b.png"],
        });

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        expect(JSON.parse(String(request.body)).image).toEqual([
            { image_url: "https://in.test/a.png" },
            { image_url: "https://in.test/b.png" },
        ]);
    });

    it("returns the resolved image item for a normal url response", async () => {
        const client = newClient();

        fetchMock
            .mockResolvedValueOnce(
                makeResponse({ data: [{ url: "https://img.test/x.png" }] }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "image/png",
                }),
            );

        const result = await client.imageEdit("make it blue", {
            image: "https://in.test/y.png",
        });

        expect(result.url).toBe("https://img.test/x.png");
        expect(result.contentType).toBe("image/png");
    });

    it("throws the API error when an image URL cannot be downloaded", async () => {
        const client = newClient();

        fetchMock
            .mockResolvedValueOnce(
                makeResponse({ data: [{ url: "https://img.test/x.png" }] }),
            )
            .mockResolvedValueOnce(
                makeResponse(
                    {
                        error: {
                            message: "Image not found",
                            code: "NOT_FOUND",
                        },
                    },
                    { ok: false, status: 404 },
                ),
            );

        await expect(client.imageEdit("make it blue")).rejects.toMatchObject({
            message: "Image not found",
            code: "NOT_FOUND",
            status: 404,
        });
    });

    it("returns the resolved image item for a b64_json response", async () => {
        const client = newClient();

        // "AAAA" base64 decodes to 3 zero bytes.
        fetchMock.mockResolvedValueOnce(
            makeResponse({ data: [{ b64_json: "AAAA" }] }),
        );

        const result = await client.imageEdit("make it blue");
        expect(result.contentType).toBe("image/png");
        expect(result.url).toBe("");
        expect(result.buffer.byteLength).toBe(3);
    });

    it("keeps the declared media type of a b64_json response", async () => {
        fetchMock.mockResolvedValueOnce(
            makeResponse({
                data: [{ b64_json: "PHN2Zy8+", media_type: "image/svg+xml" }],
            }),
        );

        const result = await newClient().imageEdit("make it a vector");
        expect(result.contentType).toBe("image/svg+xml");
    });

    it("throws INVALID_RESPONSE / status 500 when the item has neither url nor b64_json", async () => {
        const client = newClient();

        fetchMock.mockResolvedValueOnce(makeResponse({ data: [{}] }));

        await expect(client.imageEdit("make it blue")).rejects.toMatchObject({
            message: "Unexpected response format from image edit",
            code: "INVALID_RESPONSE",
            status: 500,
        });
    });

    it("throws NO_IMAGE / status 500 when the response has no data items", async () => {
        const client = newClient();

        fetchMock.mockResolvedValueOnce(makeResponse({ data: [] }));

        await expect(client.imageEdit("make it blue")).rejects.toMatchObject({
            code: "NO_IMAGE",
            status: 500,
        });
    });
});

describe("Pollinations model discovery", () => {
    it.each([
        [undefined, "https://example.test/models"],
        ["text", "https://example.test/text/models"],
        ["image", "https://example.test/image/models"],
        ["video", "https://example.test/video/models"],
        ["audio", "https://example.test/audio/models"],
        ["embeddings", "https://example.test/embeddings/models"],
    ] as const)("models(%s) fetches %s", async (kind, expectedUrl) => {
        const client = newClient();
        const models = [{ name: "test-model", title: "Test Model" }];
        fetchMock.mockResolvedValueOnce(makeResponse(models));

        await expect(client.models(kind)).resolves.toEqual(models);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
    });

    it("getModels passes the kind through", async () => {
        configure({ apiKey: "sk_test", baseUrl: "https://example.test" });
        fetchMock.mockResolvedValueOnce(makeResponse([]));

        await getModels("video");
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://example.test/video/models",
        );
    });
});

describe("Pollinations.authorizeDevice", () => {
    const deviceCode = {
        device_code: "dev",
        user_code: "ABCD",
        verification_uri_complete: "https://example.test/device",
        expires_in: 60,
        interval: 5,
    };

    async function pollWith(...tokenResponses: Response[]) {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(Response.json(deviceCode));
        for (const res of tokenResponses) fetchMock.mockResolvedValueOnce(res);
        const auth = await Pollinations.authorizeDevice();
        const result = auth.poll();
        result.catch(() => {});
        await vi.advanceTimersByTimeAsync(5000 * tokenResponses.length);
        return result;
    }

    it.each([
        [
            new Response("Service Unavailable", { status: 503 }),
            503,
            "DEVICE_FLOW_ERROR",
        ],
        [
            Response.json({ error: "access_denied" }, { status: 400 }),
            400,
            "access_denied",
        ],
    ])("keeps the token endpoint status (%#)", async (res, status, code) => {
        await expect(pollWith(res)).rejects.toMatchObject({ status, code });
    });

    it("keeps polling while pending and returns the token", async () => {
        await expect(
            pollWith(
                Response.json(
                    { error: "authorization_pending" },
                    { status: 400 },
                ),
                Response.json({ access_token: "sk_device" }),
            ),
        ).resolves.toBe("sk_device");
    });
});

describe("Pollinations.accountQuests", () => {
    it("fetches the quest catalog and returns it typed", async () => {
        const client = newClient();
        const questsResponse = {
            quests: [
                {
                    id: "quest-sdk-methods",
                    title: "Ship an SDK method",
                    description: "Add a new account method to the SDK",
                    category: "sdk",
                    state: "available",
                    status: "open",
                    rewardAmount: 5,
                    balanceBucket: "tier",
                    url: null,
                    reward: null,
                },
            ],
        };
        fetchMock.mockResolvedValueOnce(makeResponse(questsResponse));

        await expect(client.accountQuests()).resolves.toEqual(questsResponse);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://example.test/account/quests",
        );
    });
});

describe("Pollinations sites", () => {
    it("deploys inline files, lists and deletes sites", async () => {
        const client = newClient();
        const site = {
            name: "my-app",
            url: "https://my-app.pollinations.app",
            createdAt: "2026-10-22T00:00:00.000Z",
            publishedAt: "2026-10-22T00:00:00.000Z",
            blocked: false,
        };
        fetchMock
            .mockResolvedValueOnce(makeResponse(site))
            .mockResolvedValueOnce(makeResponse({ data: [site], limits: {} }))
            .mockResolvedValueOnce(makeResponse({ name: "my-app" }));
        const files = [{ file: "index.html", data: "<h1>Hi</h1>" }];

        await expect(client.deploySite("my-app", files)).resolves.toEqual(site);
        await expect(client.listSites()).resolves.toMatchObject({
            data: [site],
        });
        await client.deleteSite("my-app");

        const [deploy, list, remove] = fetchMock.mock.calls;
        expect(deploy?.[0]).toBe("https://example.test/account/sites/my-app");
        expect(deploy?.[1]).toMatchObject({
            method: "PUT",
            body: JSON.stringify({ files }),
        });
        expect(list?.[0]).toBe("https://example.test/account/sites");
        expect(remove?.[1]).toMatchObject({ method: "DELETE" });
    });
});

describe("usage CSV export", () => {
    const csv = "timestamp,model\n2026-10-08,openai\n";
    const csvResponse = () =>
        new Response(csv, { headers: { "content-type": "text/csv" } });

    it("returns usage history CSV as text", async () => {
        fetchMock.mockResolvedValueOnce(csvResponse());
        const text: string = await newClient().accountUsage({ format: "csv" });
        expect(text).toBe(csv);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://example.test/account/usage?format=csv",
        );
    });

    it("returns daily usage CSV as text", async () => {
        fetchMock.mockResolvedValueOnce(csvResponse());
        const text: string = await newClient().accountUsageDaily({
            format: "csv",
        });
        expect(text).toBe(csv);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://example.test/account/usage/daily?format=csv",
        );
    });
});

describe("3D, model status and timestamped speech", () => {
    const alignment = {
        characters: ["H", "i", "\t", " ", "🌻", "!"],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    };
    const speech = {
        audio_base64: "QUJD",
        alignment: {
            ...alignment,
            characters: ["h", "i", "\t", " ", "🌻", "!"],
        },
        normalized_alignment: alignment,
    };

    it.each(["model/gltf-binary", "application/octet-stream"])(
        "returns 3D bytes and the server MIME type (%s) without putting the key in URLs",
        async (contentType) => {
            fetchMock.mockResolvedValue(makeResponse(null, { contentType }));
            const result = await newClient().model3d("a chair / blue?", {
                model: "microsoft/trellis-2",
                referenceImage: [
                    "https://a.test/x?a=1&b=2",
                    "https://b.test/y",
                ],
                resolution: "low",
                seed: 0,
                safe: false,
            });
            const [url, init] = fetchMock.mock.calls[0];
            const parsed = new URL(url);
            expect(parsed.pathname).toBe("/3d/a%20chair%20%2F%20blue%3F");
            expect(Object.fromEntries(parsed.searchParams)).toEqual({
                model: "microsoft/trellis-2",
                image: "https://a.test/x?a=1&b=2|https://b.test/y",
                resolution: "low",
                seed: "0",
                safe: "false",
            });
            expect(init.headers.Authorization).toBe("Bearer sk_test");
            expect(result).toEqual({
                buffer: new ArrayBuffer(8),
                contentType,
                url,
            });
        },
    );

    it("leaves 3D model defaults to the server and lists 3D models", async () => {
        fetchMock.mockResolvedValue(makeResponse([]));
        await newClient().model3d("chair");
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://example.test/3d/chair",
        );
        await newClient().models("3d");
        expect(fetchMock.mock.calls[1][0]).toBe(
            "https://example.test/3d/models",
        );
    });

    it.each([
        [{ timeout: 50 }, 50],
        [{ timeout: 50, videoTimeout: 20 }, 20],
    ] as const)(
        "uses the configured 3D timeout (%j)",
        async (config, timeout) => {
            vi.useFakeTimers();
            fetchMock.mockImplementation(
                (_url: string, init: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init.signal?.addEventListener("abort", () =>
                            reject(new DOMException("Aborted", "AbortError")),
                        );
                    }),
            );
            const client = new Pollinations({ apiKey: "test", ...config });
            const assertion = expect(
                client.model3d("test"),
            ).rejects.toMatchObject({ code: "TIMEOUT", status: 408 });
            await vi.advanceTimersByTimeAsync(timeout);
            await assertion;
        },
    );

    it("returns model status metadata and nullable metrics without reshaping them", async () => {
        const body = {
            meta: [],
            data: [{ model: "test", latency_p50_ms: null }],
            rows: 1,
        };
        fetchMock.mockResolvedValue(makeResponse(body));
        await expect(
            newClient().modelStatus({ traffic: "regular", minutes: 1 }),
        ).resolves.toEqual(body);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            "https://example.test/models/status?traffic=regular&minutes=1",
        );
        expect(init.headers.Authorization).toBe("Bearer sk_test");
        await newClient().modelStatus();
        expect(fetchMock.mock.calls[1][0]).toBe(
            "https://example.test/models/status",
        );
    });

    it("posts speech options and derives words from normalized character timings", async () => {
        fetchMock.mockResolvedValue(makeResponse(speech));
        const result = await newClient().audioSpeechWithTimestamps("hi 🌻!", {
            voice: "nova",
            model: "elevenlabs/eleven-v3",
            responseFormat: "pcm",
            seed: 0,
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            "https://example.test/v1/audio/speech/with-timestamps",
        );
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({
            Authorization: "Bearer sk_test",
            "Content-Type": "application/json",
        });
        expect(JSON.parse(init.body)).toEqual({
            input: "hi 🌻!",
            voice: "nova",
            model: "elevenlabs/eleven-v3",
            response_format: "pcm",
            seed: 0,
        });
        expect(result).toEqual({
            ...speech,
            words: [
                { word: "Hi", start: 0, end: 0.2 },
                { word: "🌻!", start: 0.4, end: 0.6 },
            ],
        });
    });

    it.each([
        null,
        { audio_base64: 123 },
        {
            ...speech,
            normalized_alignment: {
                ...alignment,
                character_end_times_seconds: [],
            },
        },
        {
            ...speech,
            normalized_alignment: {
                ...alignment,
                character_start_times_seconds: ["0", 0, 0, 0, 0, 0],
            },
        },
    ])("rejects malformed timestamp data (%j)", async (body) => {
        fetchMock.mockResolvedValue(makeResponse(body));
        await expect(
            newClient().audioSpeechWithTimestamps("hi"),
        ).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
    });

    it.each([null, undefined])(
        "preserves audio when normalized timings are %s",
        async (normalized_alignment) => {
            const body = {
                audio_base64: speech.audio_base64,
                alignment: null,
                normalized_alignment,
            };
            fetchMock.mockResolvedValue(makeResponse(body));
            await expect(
                newClient().audioSpeechWithTimestamps("hi"),
            ).resolves.toEqual({ ...body, words: [] });
        },
    );

    it("uses normalized timings even when original alignment is missing", async () => {
        fetchMock.mockResolvedValue(
            makeResponse({ ...speech, alignment: null }),
        );
        const result = await newClient().audioSpeechWithTimestamps("hi 🌻!");
        expect(result.words).toEqual([
            { word: "Hi", start: 0, end: 0.2 },
            { word: "🌻!", start: 0.4, end: 0.6 },
        ]);
        expect(result.audio_base64).toBe(speech.audio_base64);
        expect(result.alignment).toBeNull();
    });

    it.each(["model3d", "audioSpeechWithTimestamps"] as const)(
        "%s rejects empty input before fetching",
        async (method) => {
            await expect(newClient()[method]("")).rejects.toMatchObject({
                code: "INVALID_INPUT",
                status: 400,
            });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it.each(["model3d", "modelStatus", "audioSpeechWithTimestamps"] as const)(
        "%s preserves API errors and rejects pre-aborted requests",
        async (method) => {
            fetchMock.mockResolvedValue(
                makeResponse(
                    { error: { message: "Try later", code: "UNAVAILABLE" } },
                    { ok: false, status: 503 },
                ),
            );
            const client = newClient();
            const run = (signal?: AbortSignal) =>
                method === "modelStatus"
                    ? client.modelStatus({ signal })
                    : client[method]("hi", { signal });
            await expect(run()).rejects.toMatchObject({
                status: 503,
                message: "Try later",
            });
            fetchMock.mockClear();
            const controller = new AbortController();
            controller.abort();
            await expect(run(controller.signal)).rejects.toMatchObject({
                code: "CANCELLED",
                status: 499,
            });
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});

describe("response body cancellation", () => {
    let server: Server;
    let baseUrl: string;
    let status: number;
    const bodyTimers = new Set<ReturnType<typeof setTimeout>>();

    beforeEach(async () => {
        status = 200;
        server = createServer((request, response) => {
            request.resume();
            response.writeHead(status, { "content-type": "application/json" });
            response.flushHeaders();
            const timer = setTimeout(() => {
                bodyTimers.delete(timer);
                response.end(
                    JSON.stringify({
                        choices: [],
                        error: { message: "failed" },
                    }),
                );
            }, 500);
            bodyTimers.add(timer);
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        if (!address || typeof address === "string")
            throw new Error("No server address");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        for (const timer of bodyTimers) clearTimeout(timer);
        bodyTimers.clear();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    });

    for (const method of [
        "chat",
        "image",
        "model3d",
        "modelStatus",
        "audioSpeechWithTimestamps",
    ] as const) {
        for (const responseStatus of [200, 503]) {
            for (const cancellation of ["abort", "timeout"] as const) {
                it(`${method} ${cancellation} after actual ${responseStatus} headers interrupts the body`, async () => {
                    status = responseStatus;
                    const controller = new AbortController();
                    const add = vi.spyOn(controller.signal, "addEventListener");
                    const remove = vi.spyOn(
                        controller.signal,
                        "removeEventListener",
                    );
                    let receivedHeaders = false;
                    fetchMock.mockImplementation(
                        async (...args: Parameters<typeof fetch>) => {
                            const response = await nativeFetch(...args);
                            receivedHeaders = true;
                            if (cancellation === "abort")
                                setTimeout(() => controller.abort(), 10);
                            return response;
                        },
                    );
                    const client = new Pollinations({
                        apiKey: "local-test",
                        baseUrl,
                        timeout: cancellation === "timeout" ? 200 : 2000,
                    });
                    const request =
                        method === "chat"
                            ? client.chat([{ role: "user", content: "test" }], {
                                  signal: controller.signal,
                              })
                            : method === "modelStatus"
                              ? client.modelStatus({
                                    signal: controller.signal,
                                })
                              : client[method]("test", {
                                    signal: controller.signal,
                                });
                    await expect(request).rejects.toMatchObject({
                        code:
                            cancellation === "abort" ? "CANCELLED" : "TIMEOUT",
                        status: cancellation === "abort" ? 499 : 408,
                    });
                    expect(receivedHeaders).toBe(true);
                    expect(remove).toHaveBeenCalledWith(
                        "abort",
                        add.mock.calls[0][1],
                    );
                });
            }
        }
    }
});

describe("async media jobs", () => {
    const id = "b".repeat(64);

    it("submits all four media kinds with Prefer and no credential in the URL", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                {
                    id,
                    status: "pending",
                    status_url: `https://example.test/v1/jobs/${id}`,
                },
                { status: 202 },
            ),
        );
        const client = newClient();
        for (const submit of [
            () => client.imageAsync("an owl", { seed: 1 }),
            () => client.videoAsync("an owl flies", { duration: 4 }),
            () => client.audioAsync("hello", { voice: "nova" }),
            () => client.model3dAsync("an owl sculpture", { seed: 2 }),
        ]) {
            expect(await submit()).toMatchObject({ id, status: "pending" });
        }
        expect(fetchMock).toHaveBeenCalledTimes(4);
        for (const [url, init] of fetchMock.mock.calls) {
            expect(new URL(url as string).searchParams.has("key")).toBe(false);
            expect((init as RequestInit).headers).toMatchObject({
                Authorization: "Bearer sk_test",
                Prefer: "respond-async",
            });
        }
    });

    it("reads status and binary result, handling an immediate cache hit", async () => {
        fetchMock
            .mockResolvedValueOnce(
                makeResponse({
                    id,
                    status: "succeeded",
                    created_at: 1,
                    result_url: `https://example.test/v1/jobs/${id}/result`,
                }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    contentType: "image/png",
                    kind: "binary",
                }),
            )
            .mockResolvedValueOnce(
                makeResponse(null, {
                    contentType: "image/png",
                    kind: "binary",
                }),
            );
        const client = newClient();
        expect((await client.job(id)).status).toBe("succeeded");
        const result = await client.jobResult(id);
        expect(result.contentType).toBe("image/png");
        expect(result.buffer.byteLength).toBe(8);
        expect(await client.imageAsync("cached owl")).toMatchObject({
            status: "succeeded",
            result: { contentType: "image/png" },
        });
        await expect(client.job("../other-account")).rejects.toMatchObject({
            code: "INVALID_INPUT",
            status: 400,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
