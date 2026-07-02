import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    __resetLatencyStateForTests,
    registerServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";
import { callFluxWithFallback } from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
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
    model: "flux",
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
    syncImageEnv(
        { FIREWORKS_API_KEY: "fw-test-key" } as unknown as CloudflareBindings,
        ["FIREWORKS_API_KEY"] as never[],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callFluxWithFallback", () => {
    it("serves from the self-hosted flux pool when a worker is registered", async () => {
        await registerServer("https://gpu1.example", "flux");
        const calls = mockFetch(() => poolResponse());

        const result = await callFluxWithFallback("a red apple", fluxParams);

        expect(calls).toEqual(["https://gpu1.example/generate"]);
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
        expect(result.trackingData?.actualModel).toBe("flux");
    });

    it("falls back to Fireworks when no flux worker is registered", async () => {
        const calls = mockFetch(
            () => new Response(JPEG_BYTES, { status: 200 }),
        );

        const result = await callFluxWithFallback("a red apple", fluxParams);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain("api.fireworks.ai");
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
        expect(result.isMature).toBe(false);
    });

    it("falls back to Fireworks when the pool request fails", async () => {
        await registerServer("https://gpu1.example", "flux");
        const calls = mockFetch((url) =>
            new URL(url).hostname === "gpu1.example"
                ? new Response("CUDA error", { status: 500 })
                : new Response(JPEG_BYTES, { status: 200 }),
        );

        const result = await callFluxWithFallback("a red apple", fluxParams);

        expect(calls).toHaveLength(2);
        expect(calls[0]).toBe("https://gpu1.example/generate");
        expect(calls[1]).toContain("api.fireworks.ai");
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
    });
});
