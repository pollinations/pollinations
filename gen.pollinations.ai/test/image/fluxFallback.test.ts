import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRetryableFallbackError } from "../../src/fallback.ts";
import {
    __resetLatencyStateForTests,
    registerServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";
import { callSelfHostedServer } from "../../src/image/createAndReturnImages.ts";
import type { ImageParams } from "../../src/image/params.ts";

// Minimal in-memory KV stub matching the subset of KVNamespace we use
// (same shape as availableServers.test.ts).
function makeKv() {
    const store = new Map<string, string>();
    return {
        async get(key: string, _type?: "json") {
            const raw = store.get(key);
            if (raw === undefined) return null;
            return JSON.parse(raw);
        },
        async put(key: string, value: string) {
            store.set(key, value);
        },
        async list({ prefix }: { prefix: string }) {
            const keys = [...store.keys()]
                .filter((k) => k.startsWith(prefix))
                .map((name) => ({ name }));
            return { keys };
        },
        async delete(key: string) {
            store.delete(key);
        },
    } as unknown as KVNamespace;
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const fluxParams: ImageParams = {
    model: "black-forest-labs/FLUX.1-schnell",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 0,
};

// Records fetched URLs; per-URL responder decides what each backend returns.
function mockFetch(respond: (url: string) => Response) {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = typeof url === "string" ? url : url.toString();
        calls.push(href);
        return respond(href);
    });
    return calls;
}

const poolResponse = () =>
    new Response(
        JSON.stringify([
            {
                image: Buffer.from(JPEG_BYTES).toString("base64"),
                has_nsfw_concept: false,
                concept: null,
                width: 1024,
                height: 1024,
                seed: 42,
            },
        ]),
        { status: 200 },
    );

beforeEach(() => {
    setServerRegistryBinding(makeKv(), "test");
    __resetLatencyStateForTests();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Flux primary route", () => {
    it("serves from the self-hosted flux pool when a worker is registered", async () => {
        await registerServer("https://gpu1.example", "flux");
        const calls = mockFetch(() => poolResponse());

        const result = await callSelfHostedServer(
            "a red apple",
            fluxParams,
            "flux",
        );

        expect(calls).toEqual(["https://gpu1.example/generate"]);
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
        expect(result.trackingData?.actualModel).toBe(
            "black-forest-labs/FLUX.1-schnell",
        );
    });

    it("marks an empty pool as a retryable upstream failure", async () => {
        let error: unknown;
        try {
            await callSelfHostedServer("a red apple", fluxParams, "flux");
        } catch (caught) {
            error = caught;
        }

        expect(error).toMatchObject({ status: 503 });
        expect(isRetryableFallbackError(error)).toBe(true);
    });

    it("preserves a pool 5xx as a retryable upstream failure", async () => {
        await registerServer("https://gpu1.example", "flux");
        const calls = mockFetch(
            () => new Response("CUDA error", { status: 500 }),
        );
        let error: unknown;
        try {
            await callSelfHostedServer("a red apple", fluxParams, "flux");
        } catch (caught) {
            error = caught;
        }

        expect(calls).toEqual(["https://gpu1.example/generate"]);
        expect(error).toMatchObject({ status: 500 });
        expect(isRetryableFallbackError(error)).toBe(true);
    });
});
