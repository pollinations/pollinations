import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import {
    chat,
    configure,
    generateAudio,
    generateImage,
    generateText,
    generateVideo,
    resetClient,
} from "./helpers.js";
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
        const chunks = typeof body === "string" ? [encoder.encode(body)] : [];
        let i = 0;
        resp.body = {
            getReader: () => ({
                read: async () =>
                    i < chunks.length
                        ? { done: false, value: chunks[i++] }
                        : { done: true, value: undefined },
                releaseLock: () => {},
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
        const stream = 'data: {"choices":[{"delta":{"content":"x"}}]}\n';
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

        await client.image("a cat", { seed: -1 });
        await client.video("a long scene", {
            model: "nova-reel",
            duration: 120,
            seed: -1,
        });

        const imageUrl = fetchMock.mock.calls[0][0] as string;
        const videoUrl = new URL(fetchMock.mock.calls[1][0] as string);
        expect(seedFromUrl(imageUrl)).toBe("-1");
        expect(videoUrl.searchParams.get("seed")).toBe("-1");
        expect(videoUrl.searchParams.get("duration")).toBe("120");
    });

    it("passes seed through text and chat requests consistently", async () => {
        const client = newClient();
        const stream = 'data: {"choices":[{"delta":{"content":"x"}}]}\n';
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
        ].join("\n");
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
                ].join("\n"),
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

    it("rejects malformed stream events without choices", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                [
                    'data: {"provider_metadata":{"status":"ok"}}',
                    "data: [DONE]",
                    "",
                ].join("\n"),
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

    it("stops at DONE before provider trailer data", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                [
                    'data: {"choices":[]}',
                    "data: [DONE]",
                    'data: {"provider_metadata":{"private":true}}',
                    "",
                ].join("\n"),
                {
                    kind: "stream",
                    contentType: "text/event-stream",
                },
            ),
        );

        const chunks = [];
        for await (const chunk of newClient().chatStream([
            { role: "user", content: "hello" },
        ])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual([{ choices: [] }]);
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
