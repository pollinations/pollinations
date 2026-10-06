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

    it.each([
        true,
        false,
    ])("preserves text options and response metadata in raw mode (json: %s)", async (json) => {
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
    });

    it.each([
        false,
        true,
    ])("rejects an empty text prompt before dispatch (raw: %s)", async (raw) => {
        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await expect(generateText("", { raw })).rejects.toMatchObject({
            code: "INVALID_INPUT",
            status: 400,
            message: "Prompt is required and must be a string",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

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
    ] as const)("%s rejects an already-aborted signal before dispatch (reason: %s)", async (method, reason) => {
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
                : client.chat([{ role: "user", content: "hello" }], options);

        await expect(request).rejects.toBeInstanceOf(PollinationsError);
        await expect(request).rejects.toMatchObject({
            code: "CANCELLED",
            status: 499,
            message: "Request was cancelled",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

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

    it("keeps video requests alive until the 20-minute default timeout", async () => {
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

        const request = newClient().video("a long-running scene");
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
    });

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

    it.each([
        "voice-changer",
        "voice-isolator",
    ] as const)("posts the original file to %s without a text prompt", async (operation) => {
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
    });
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
        const stream = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n';
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
    it("keeps an uploaded file's name for transcription", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(makeResponse({ text: "hello" }));

        await client.transcribe(
            new File([new Uint8Array(8)], "clip.wav", { type: "audio/wav" }),
        );
        await client.transcribe(new ArrayBuffer(8));

        const files = fetchMock.mock.calls.map(
            ([, request]) =>
                ((request as RequestInit).body as FormData).get("file") as File,
        );
        expect(files.map((file) => file.name)).toEqual([
            "clip.wav",
            "audio.mp3",
        ]);
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
        const stream = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n';
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

    it.each([
        "",
        [],
    ])("rejects empty input %j without a request", async (input) => {
        await expect(newClient().embeddings(input)).rejects.toMatchObject({
            code: "INVALID_INPUT",
            status: 400,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

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

        expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({
            model: "floret",
            stream: false,
            routing: {
                text: "openai",
                web_search: "perplexity-fast",
                image_generation: "flux",
                image_editing: "nanobanana",
                video: "veo",
                audio: "elevenlabs",
            },
        });
    });

    it("serializes partial routing for streaming chat requests", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse(
                'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
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

        expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({
            model: "floret",
            stream: true,
            routing: { video: "veo" },
        });
    });

    it("omits routing when no override is provided", async () => {
        const client = newClient();
        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await client.chat([{ role: "user", content: "hello" }], {
            model: "floret",
        });

        expect(bodyOf(fetchMock.mock.calls[0]).routing).toBeUndefined();
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
            routing,
            seed: 0,
            temperature: 0,
            stream: true,
        });
    });

    it.each([
        "\n",
        "\r",
        "\r\n",
    ])("preserves UTF-8 and tool/usage events split at every byte (%j)", async (newline) => {
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
            .map((event) => `data:${JSON.stringify(event)}${newline}${newline}`)
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
    });

    it("discards an incomplete SSE event at EOF", async () => {
        const event = { choices: [{ delta: { content: "last" } }] };
        fetchMock.mockResolvedValue(
            new Response(`data: ${JSON.stringify(event)}`),
        );

        const chunks = [];
        for await (const chunk of newClient().chatStream([
            { role: "user", content: "hello" },
        ])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual([]);
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
    ])("preserves streamed error status and code: %j", async (error, status, code) => {
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
    });

    it.each([
        undefined,
        null,
    ])("rejects an error finish reason even with error=%s", async (error) => {
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
    });

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
    it("returns the model array from the registry endpoint", async () => {
        const client = newClient();
        const models = [{ name: "openai", title: "OpenAI" }];
        fetchMock.mockResolvedValueOnce(makeResponse(models));

        await expect(client.models()).resolves.toEqual(models);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://example.test/models",
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

    for (const method of ["chat", "image"] as const) {
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
                            : client.image("test", {
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
