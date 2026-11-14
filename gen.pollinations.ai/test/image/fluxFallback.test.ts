import {
    createExecutionContext,
    listDurableObjectIds,
    runInDurableObject,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationJobHead } from "@/middleware/generation-deduplication.ts";
import { isRetryableFallbackError } from "../../src/fallback.ts";
import {
    __resetLatencyStateForTests,
    getRegisteredServers,
    registerServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";
import { callSelfHostedServer } from "../../src/image/createAndReturnImages.ts";
import type { ImageParams } from "../../src/image/params.ts";
import worker from "../../src/index.ts";

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

// Complete 1×1 JPEG, shared format with the production GPU responses.
const JPEG_BYTES = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH8AP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//Z",
    "base64",
);

const fluxParams: ImageParams = {
    model: "black-forest-labs/flux.1-schnell",
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
    it("records latency only after receiving and validating the whole image", async () => {
        let now = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => now);
        await registerServer("https://gpu1.example", "flux");
        const body = await poolResponse().text();
        const split = Math.floor(body.length / 2);
        const encoder = new TextEncoder();
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
            start(value) {
                controller = value;
                controller.enqueue(encoder.encode(body.slice(0, split)));
            },
        });
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () => {
                now += 50;
                return new Response(stream);
            });
        const pending = callSelfHostedServer("a red apple", fluxParams, "flux");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        try {
            expect(
                (await getRegisteredServers("flux"))[0].lastMs,
            ).toBeUndefined();
        } finally {
            now += 1000;
            controller.enqueue(encoder.encode(body.slice(split)));
            controller.close();
            await pending;
        }
        expect((await getRegisteredServers("flux"))[0].lastMs).toBe(1050);
        expect((await pending).buffer).toEqual(JPEG_BYTES);
    });

    it.each([
        new TypeError("Network connection lost."),
        Object.assign(new Error("Network connection lost."), {
            retryable: true,
        }),
    ])(
        "attributes a broken body without replaying generation: %s",
        async (cause) => {
            await registerServer("https://gpu1.example", "flux");
            await registerServer("https://gpu2.example", "flux");
            vi.spyOn(Math, "random").mockReturnValue(0);
            const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(
                                new TextEncoder().encode('[{"image":"'),
                            );
                            controller.error(cause);
                        },
                    }),
                ),
            );

            await expect(
                callSelfHostedServer("a red apple", fluxParams, "flux"),
            ).rejects.toMatchObject({
                status: 502,
                upstreamStatus: 200,
                requestUrl: new URL("https://gpu1.example/generate"),
                cause,
            });
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(
                (await getRegisteredServers("flux"))[0].lastMs,
            ).toBeUndefined();
        },
    );

    it.each([
        ["invalid JSON", "not-json"],
        ["empty array", "[]"],
        ["null result", "null"],
        ["missing image", "{}"],
        ["non-string image", JSON.stringify({ image: 42 })],
        ["invalid base64", JSON.stringify({ image: "not-base64!" })],
        [
            "non-image bytes",
            JSON.stringify({
                image: Buffer.from("not an image").toString("base64"),
            }),
        ],
        [
            "truncated JPEG",
            JSON.stringify({
                image: JPEG_BYTES.subarray(0, -2).toString("base64"),
            }),
        ],
        [
            "JPEG without dimensions",
            JSON.stringify({
                image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
            }),
        ],
    ])(
        "rejects %s without recording success or replaying generation",
        async (_, body) => {
            let now = Date.now();
            vi.spyOn(Date, "now").mockImplementation(() => now++);
            await registerServer("https://gpu1.example", "flux");
            await registerServer("https://gpu2.example", "flux");
            vi.spyOn(Math, "random").mockReturnValue(0);
            const calls = mockFetch(() => new Response(body));

            await expect(
                callSelfHostedServer("a red apple", fluxParams, "flux"),
            ).rejects.toMatchObject({
                status: 502,
                upstreamStatus: 200,
                requestUrl: new URL("https://gpu1.example/generate"),
            });
            expect(calls).toEqual(["https://gpu1.example/generate"]);
            expect(
                (await getRegisteredServers("flux"))[0].lastMs,
            ).toBeUndefined();
        },
    );

    it("preserves object-shaped backend responses and usage", async () => {
        await registerServer("https://gpu1.example", "flux");
        mockFetch(() =>
            Response.json({ image: JPEG_BYTES.toString("base64"), seed: 42 }),
        );
        const result = await callSelfHostedServer(
            "a red apple",
            fluxParams,
            "flux",
        );
        expect(result).toMatchObject({
            buffer: JPEG_BYTES,
            seed: 42,
            trackingData: {
                usage: { completionImageTokens: 1, totalTokenCount: 1 },
            },
        });
    });

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
            "black-forest-labs/flux.1-schnell",
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

describe("Dreamshaper API response delivery", () => {
    it.each([false, true])(
        "preserves disconnect/rejoin, cache, billing and error attribution (broken body: %s)",
        async (brokenBody) => {
            const { key, userId } = await createTestApiKey({
                user: { packBalance: 100 },
            });
            setServerRegistryBinding(env.KV, "test");
            await registerServer("https://dreamshaper-backend.test", "sana");
            const tinybird = createMockTinybird();
            let executions = 0;
            let finishBody!: () => void;
            let started!: () => void;
            const providerStarted = new Promise<void>((resolve) => {
                started = resolve;
            });
            const body = await poolResponse().text();
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    if (url.host === "dreamshaper-backend.test") {
                        executions++;
                        expect(url.pathname).toBe("/generate");
                        const response = new Response(
                            new ReadableStream<Uint8Array>({
                                start(controller) {
                                    const encoder = new TextEncoder();
                                    controller.enqueue(
                                        encoder.encode(body.slice(0, 20)),
                                    );
                                    finishBody = () => {
                                        if (brokenBody) {
                                            controller.error(
                                                Object.assign(
                                                    new Error(
                                                        "Network connection lost.",
                                                    ),
                                                    { retryable: true },
                                                ),
                                            );
                                        } else {
                                            controller.enqueue(
                                                encoder.encode(body.slice(20)),
                                            );
                                            controller.close();
                                        }
                                    };
                                },
                            }),
                        );
                        started();
                        return response;
                    }
                    if (url.pathname === "/v0/pipes/public_model_stats.json") {
                        return Response.json({ data: [] });
                    }
                    const handler = tinybird.handlerMap[url.host];
                    if (handler) return handler(new Request(input, init));
                    throw new Error(
                        `Unexpected outbound request: ${url.host}${url.pathname}`,
                    );
                },
            );
            const url = `https://gen.pollinations.ai/image/body-validation-${crypto.randomUUID()}?model=lykon/dreamshaper-8-lcm&width=512&height=512&safe=false`;
            const request = () =>
                new Request(url, {
                    headers: { authorization: `Bearer ${key}` },
                });
            const before = await getUserBalance(drizzle(env.DB), userId);
            const existingIds = new Set(
                (await listDurableObjectIds(env.GENERATION_COORDINATOR)).map(
                    (id) => id.toString(),
                ),
            );
            const abort = new AbortController();
            const first = SELF.fetch(
                new Request(request(), { signal: abort.signal }),
            );
            let disconnectError: Error | undefined;
            const firstSettled = first.catch((error: Error) => {
                disconnectError = error;
            });
            await Promise.race([
                providerStarted,
                first.then(async (response) => {
                    if (!executions)
                        throw new Error(
                            `Returned before backend: ${response.status} ${await response.text()}`,
                        );
                }),
            ]);
            expect(
                (await getRegisteredServers("sana"))[0].lastMs,
            ).toBeUndefined();
            const ids = (
                await listDurableObjectIds(env.GENERATION_COORDINATOR)
            ).filter((id) => !existingIds.has(id.toString()));
            expect(ids).toHaveLength(1);
            const stub = env.GENERATION_COORDINATOR.get(ids[0]);
            const stored = await runInDurableObject(
                stub,
                (_coordinator, state) =>
                    state.storage.get<GenerationJobHead>("job"),
            );
            expect(stored).toBeDefined();
            if (!stored) throw new Error("Generation job was not persisted");
            abort.abort();
            await vi.waitFor(
                () => expect(disconnectError?.name).toBe("AbortError"),
                { timeout: 3000 },
            );
            const ctx = createExecutionContext();
            const second = worker.fetch(request(), env, ctx);
            try {
                await vi.waitFor(
                    async () =>
                        expect(
                            await runInDurableObject(
                                stub,
                                (coordinator) =>
                                    Reflect.get(coordinator, "waiters").size,
                            ),
                        ).toBe(2),
                    { timeout: 5000 },
                );
            } finally {
                finishBody();
            }
            const response = await second;
            const output = await response.arrayBuffer();
            expect(response.status, new TextDecoder().decode(output)).toBe(
                brokenBody ? 502 : 200,
            );
            await Promise.all([firstSettled, waitOnExecutionContext(ctx)]);
            expect(executions).toBe(1);
            const after = await getUserBalance(drizzle(env.DB), userId);
            expect(tinybird.state.events).toHaveLength(1);
            expect(tinybird.state.events[0]).toMatchObject({
                modelUsed: "lykon/dreamshaper-8-lcm",
                responseStatus: brokenBody ? 502 : 200,
                isBilledUsage: !brokenBody,
            });
            if (brokenBody) {
                expect(tinybird.state.events[0].errorSource).toBe(
                    "dreamshaper-backend.test",
                );
                expect(tinybird.state.errorEvents).toEqual([
                    expect.objectContaining({
                        upstream_host: "dreamshaper-backend.test",
                        upstream_status: 200,
                    }),
                ]);
                expect(after.packBalance).toBe(before.packBalance);
                expect(
                    (await getRegisteredServers("sana"))[0].lastMs,
                ).toBeUndefined();
            } else {
                expect(
                    (await getRegisteredServers("sana"))[0].lastMs,
                ).toBeGreaterThan(0);
                const cachedCtx = createExecutionContext();
                const cached = await worker.fetch(request(), env, cachedCtx);
                expect(cached.status).toBe(200);
                expect(cached.headers.get("x-cache")).toBe("HIT");
                expect(await cached.arrayBuffer()).toEqual(output);
                await waitOnExecutionContext(cachedCtx);
                const file = await env.MEDIA.get(stored.cache.key);
                expect(file?.status).toBe(200);
                if (!file) throw new Error("Generated file was not cached");
                expect(await file.arrayBuffer()).toEqual(output);
                expect(executions).toBe(1);
                expect(tinybird.state.events).toHaveLength(1);
                expect(tinybird.state.events[0].totalPrice).toBeGreaterThan(0);
                expect(before.packBalance - after.packBalance).toBeCloseTo(
                    tinybird.state.events[0].totalPrice,
                    8,
                );
            }
            expect(after.tierBalance).toBe(before.tierBalance);
        },
        30_000,
    );
});
