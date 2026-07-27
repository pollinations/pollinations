import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    __resetLatencyStateForTests,
    registerServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";
import {
    type AuthResult,
    callFluxWithFallback,
    createAndReturnImageCached,
} from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import type { ImageParams } from "../../src/image/params.ts";
import { setImagesBinding } from "../../src/image/utils/imageTransform.ts";

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

const poolResponse = (bytes: Uint8Array = JPEG_BYTES) =>
    new Response(
        JSON.stringify([
            {
                image: Buffer.from(bytes).toString("base64"),
                has_nsfw_concept: false,
                concept: null,
                width: 1024,
                height: 1024,
                seed: 42,
            },
        ]),
        { status: 200 },
    );

const userInfo: AuthResult = {
    tokenAuth: false,
    userId: null,
    username: null,
};

// A PNG header is enough to carry dimensions through the pipeline and read
// them back off the final buffer.
function pngWithDimensions(width: number, height: number): Buffer {
    const png = Buffer.alloc(24);
    png.write("\x89PNG\r\n\x1a\n", 0, "binary");
    png.write("IHDR", 12, "binary");
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    return png;
}

function readPngDimensions(buffer: Buffer) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// Stands in for the Cloudflare Images binding: outputs the size it was asked
// to transform to, or the source size when no transform was requested.
function fakeImagesBinding(): ImagesBinding {
    return {
        input(stream: ReadableStream<Uint8Array>) {
            let target: { width: number; height: number } | null = null;
            const pipeline = {
                transform(options: { width: number; height: number }) {
                    target = options;
                    return pipeline;
                },
                async output() {
                    const source = readPngDimensions(
                        Buffer.from(await new Response(stream).arrayBuffer()),
                    );
                    const { width, height } = target || source;
                    return {
                        response: () =>
                            new Response(
                                Uint8Array.from(
                                    pngWithDimensions(width, height),
                                ),
                            ),
                    };
                },
            };
            return pipeline;
        },
    } as unknown as ImagesBinding;
}

beforeEach(() => {
    setServerRegistryBinding(makeKv(), "test");
    __resetLatencyStateForTests();
    syncImageEnv(
        {
            REPLICATE_API_TOKEN: "replicate-test-key",
        } as unknown as CloudflareBindings,
        ["REPLICATE_API_TOKEN"] as never[],
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    setImagesBinding(undefined);
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

    it("falls back to Replicate when no flux worker is registered", async () => {
        const calls = mockFetch((url) =>
            new URL(url).hostname === "api.replicate.com"
                ? new Response(
                      JSON.stringify({
                          id: "prediction-1",
                          status: "succeeded",
                          output: ["https://replicate.delivery/output.jpg"],
                          metrics: { predict_time: 0.5 },
                      }),
                      { status: 201 },
                  )
                : new Response(JPEG_BYTES, { status: 200 }),
        );

        const result = await callFluxWithFallback("a red apple", fluxParams);

        expect(calls).toEqual([
            "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
            "https://replicate.delivery/output.jpg",
        ]);
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
        expect(result.isMature).toBe(false);
    });

    it("falls back to Replicate when the pool request fails", async () => {
        await registerServer("https://gpu1.example", "flux");
        const calls = mockFetch((url) => {
            const hostname = new URL(url).hostname;
            if (hostname === "gpu1.example") {
                return new Response("CUDA error", { status: 500 });
            }
            if (hostname === "api.replicate.com") {
                return new Response(
                    JSON.stringify({
                        id: "prediction-2",
                        status: "succeeded",
                        output: ["https://replicate.delivery/output.jpg"],
                        metrics: { predict_time: 0.5 },
                    }),
                    { status: 201 },
                );
            }
            return new Response(JPEG_BYTES, { status: 200 });
        });

        const result = await callFluxWithFallback("a red apple", fluxParams);

        expect(calls).toHaveLength(3);
        expect(calls[0]).toBe("https://gpu1.example/generate");
        expect(calls[1]).toContain("api.replicate.com");
        expect(calls[2]).toBe("https://replicate.delivery/output.jpg");
        expect(Buffer.from(result.buffer).equals(Buffer.from(JPEG_BYTES))).toBe(
            true,
        );
    });
});

describe("createAndReturnImageCached dimensions", () => {
    // The pool returns whatever resolution its worker produced, ignoring the
    // requested width/height (issue #12225).
    const poolAt1024x576 = () => poolResponse(pngWithDimensions(1024, 576));

    it("resizes self-hosted pool output to the requested dimensions", async () => {
        await registerServer("https://gpu1.example", "flux");
        setImagesBinding(fakeImagesBinding());
        mockFetch(poolAt1024x576);

        const result = await createAndReturnImageCached(
            "a red apple",
            {
                ...fluxParams,
                width: 960,
                height: 640,
                dimensionsExplicit: true,
            },
            "a red apple",
            userInfo,
        );

        expect(readPngDimensions(result.buffer)).toEqual({
            width: 960,
            height: 640,
        });
    });

    it("keeps the backend resolution when no dimensions were requested", async () => {
        await registerServer("https://gpu1.example", "flux");
        setImagesBinding(fakeImagesBinding());
        mockFetch(poolAt1024x576);

        const result = await createAndReturnImageCached(
            "a red apple",
            { ...fluxParams, width: 960, height: 640 },
            "a red apple",
            userInfo,
        );

        expect(readPngDimensions(result.buffer)).toEqual({
            width: 1024,
            height: 576,
        });
    });
});
