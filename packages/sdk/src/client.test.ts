import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
