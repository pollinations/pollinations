import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import { PollinationsError } from "./types.js";

// ---------------------------------------------------------------------------
// Characterization tests for client.ts.
//
// These lock the CURRENT behavior of the retry loop, per-attempt seed
// recomputation, chat vs chatStream seed handling, and imageEdit response
// resolution. They are written to pass against the UNREFACTORED client and
// must continue to pass byte-for-byte after the dedup refactor.
// ---------------------------------------------------------------------------

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

function newClient(overrides: Record<string, unknown> = {}) {
    return new Pollinations({
        apiKey: "sk_test",
        baseUrl: "https://example.test",
        ...overrides,
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

describe("Pollinations.image — retry behavior (characterization)", () => {
    it("retries a retriable failure then succeeds; counts attempts", async () => {
        const client = newClient();

        // First attempt: network error (retriable). Second: success.
        fetchMock
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "image/png",
                }),
            );

        const result = await client.image("a cat");
        expect(result.contentType).toBe("image/png");
        // 1 failed + 1 succeeded = 2 fetch attempts.
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries up to maxRetries on persistent retriable failure", async () => {
        const client = newClient({ maxRetries: 3 });

        fetchMock.mockRejectedValue(new Error("boom"));

        await expect(client.image("a cat")).rejects.toThrow("boom");
        // Exactly maxRetries attempts.
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does NOT retry a non-retriable error (e.g. 400)", async () => {
        const client = newClient({ maxRetries: 3 });

        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "bad", code: "INVALID_INPUT" } },
                { ok: false, status: 400 },
            ),
        );

        await expect(client.image("a cat")).rejects.toBeInstanceOf(
            PollinationsError,
        );
        // Non-retriable => single attempt, no retry.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("Pollinations — per-attempt seed recomputation (characterization)", () => {
    it("image: attempt 0 sends no seed (resolveSeed(undefined)), retry sends a fresh random seed", async () => {
        const client = newClient({ maxRetries: 2 });

        // Force randomSeed() deterministic for the retry attempt.
        const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

        fetchMock
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "image/png",
                }),
            );

        await client.image("a cat"); // no explicit seed

        const url0 = fetchMock.mock.calls[0][0] as string;
        const url1 = fetchMock.mock.calls[1][0] as string;

        // Attempt 0: resolveSeed(undefined) === undefined => no seed param.
        expect(seedFromUrl(url0)).toBeNull();
        // Attempt 1: randomSeed() => concrete number, present and differs.
        const seed1 = seedFromUrl(url1);
        expect(seed1).not.toBeNull();
        expect(Number.isNaN(Number(seed1))).toBe(false);
        randSpy.mockRestore();
    });

    it("image: explicit seed -1 resolves to a concrete number on attempt 0, fresh random on retry", async () => {
        const client = newClient({ maxRetries: 2 });

        // Math.random sequence: first for resolveSeed(-1) on attempt 0,
        // second for randomSeed() on attempt 1.
        const randSpy = vi
            .spyOn(Math, "random")
            .mockReturnValueOnce(0.1)
            .mockReturnValueOnce(0.9);

        fetchMock
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(
                makeResponse(null, {
                    kind: "binary",
                    contentType: "image/png",
                }),
            );

        await client.image("a cat", { seed: -1 });

        const seed0 = seedFromUrl(fetchMock.mock.calls[0][0] as string);
        const seed1 = seedFromUrl(fetchMock.mock.calls[1][0] as string);

        // -1 resolves to a concrete number on attempt 0 (not "-1").
        expect(seed0).not.toBeNull();
        expect(seed0).not.toBe("-1");
        // Retry recomputes a fresh random seed that differs.
        expect(seed1).not.toBeNull();
        expect(seed1).not.toBe(seed0);
        randSpy.mockRestore();
    });

    it("text: attempt 0 omits seed (undefined stripped), retry sends a fresh random seed in the body", async () => {
        const client = newClient({ maxRetries: 2 });

        fetchMock
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(
                makeResponse({ choices: [{ message: { content: "hi" } }] }),
            );

        const out = await client.text("hello"); // no explicit seed
        expect(out).toBe("hi");

        const body0 = bodyOf(fetchMock.mock.calls[0]);
        const body1 = bodyOf(fetchMock.mock.calls[1]);

        // Attempt 0: seed undefined => stripped from body.
        expect("seed" in body0).toBe(false);
        // Attempt 1: randomSeed() => concrete number present.
        expect(typeof body1.seed).toBe("number");
    });
});

describe("Pollinations.chat vs chatStream — seed resolution (characterization)", () => {
    it("chat() resolves a raw -1 seed into a concrete number in the request body", async () => {
        const client = newClient();
        const randSpy = vi.spyOn(Math, "random").mockReturnValue(0.25);

        fetchMock.mockResolvedValue(
            makeResponse({ choices: [{ message: { content: "ok" } }] }),
        );

        await client.chat([{ role: "user", content: "hi" }], { seed: -1 });

        const body = bodyOf(fetchMock.mock.calls[0]);
        // chat resolves -1 to a concrete random number.
        expect(typeof body.seed).toBe("number");
        expect(body.seed).not.toBe(-1);
        randSpy.mockRestore();
    });

    it("chatStream() preserves a raw -1 seed unchanged (no resolveSeed)", async () => {
        const client = newClient();

        fetchMock.mockResolvedValue(
            makeResponse('data: {"choices":[{"delta":{"content":"x"}}]}\n', {
                kind: "stream",
                contentType: "text/event-stream",
            }),
        );

        const it = client.chatStream([{ role: "user", content: "hi" }], {
            seed: -1,
        });
        // Drain the generator so the fetch is issued.
        for await (const _ of it) {
            // consume
        }

        const body = bodyOf(fetchMock.mock.calls[0]);
        // chatStream passes the raw seed through untouched.
        expect(body.seed).toBe(-1);
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
