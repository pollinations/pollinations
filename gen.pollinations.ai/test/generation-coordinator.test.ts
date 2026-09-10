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
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@/middleware/generation-deduplication.ts";
import worker from "../src/index.ts";

function testJob(key: string, body?: string): GenerationJob {
    return {
        cache: { storage: "text", key },
        request: {
            url: "https://gen.pollinations.ai/robots.txt",
            method: body === undefined ? "GET" : "POST",
            headers: [],
            ...(body !== undefined && {
                body: new TextEncoder().encode(body),
            }),
        },
        auth: {
            user: { id: "user-1", tier: "seed" },
            apiKey: { id: "key-1" },
        },
        requestId: "request-1",
        balanceCheckResult: {
            selectedMeterId: "local:tier",
            selectedMeterSlug: "v1:meter:tier",
            balances: { "v1:meter:tier": 1, "v1:meter:pack": 2 },
        },
    };
}

async function waitForAlarm(state: DurableObjectState): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await state.storage.getAlarm()) !== null) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Generation alarm was not scheduled");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("GenerationCoordinator", () => {
    it.each(["url", "b64_json"] as const)(
        "completes large Seedream uploads once through the real coordinator (%s)",
        async (responseFormat) => {
            const { key, userId } = await createTestApiKey({
                user: { packBalance: 100 },
            });
            env.REPLICATE_API_TOKEN = "not-a-secret-workers-test-only";
            const tinybird = createMockTinybird();
            let executions = 0;
            let requestBytes = 0;
            let release!: () => void;
            const providerWaiting = new Promise<void>((resolve) => {
                release = resolve;
            });
            let started!: () => void;
            const providerStarted = new Promise<void>((resolve) => {
                started = resolve;
            });
            const output = new Uint8Array(6 * 1024 * 1024);
            output.set(
                Buffer.from(
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
                    "base64",
                ),
            );
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                    );
                    if (url.host === "api.replicate.com") {
                        expect(url.pathname).toBe(
                            "/v1/models/bytedance/seedream-4/predictions",
                        );
                        expect(init?.method).toBe("POST");
                        executions++;
                        requestBytes = String(init?.body ?? "").length;
                        started();
                        await providerWaiting;
                        return Response.json(
                            {
                                id: "large-seedream-test",
                                status: "succeeded",
                                output: [
                                    "https://replicate.delivery/large-seedream.png",
                                ],
                            },
                            { status: 201 },
                        );
                    }
                    if (url.host === "replicate.delivery") {
                        return new Response(output, {
                            headers: { "content-type": "image/png" },
                        });
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
            const prompt = `large reference coordinator test ${crypto.randomUUID()}`;
            const request = () => {
                const form = new FormData();
                form.set("model", "bytedance/seedream-4.0");
                form.set("prompt", prompt);
                form.set("safe", "false");
                form.set("size", "1920x1080");
                form.set("response_format", responseFormat);
                for (const size of [9_992_143, 12_285_506]) {
                    const bytes = new Uint8Array(size);
                    bytes.set(output.subarray(0, 8));
                    form.append(
                        "image",
                        new Blob([bytes], { type: "image/png" }),
                        "input.png",
                    );
                }
                return new Request(
                    "https://gen.pollinations.ai/v1/images/edits",
                    {
                        method: "POST",
                        headers: { authorization: `Bearer ${key}` },
                        body: form,
                    },
                );
            };
            const before = await getUserBalance(drizzle(env.DB), userId);
            const abort = new AbortController();
            const first = SELF.fetch(
                new Request(request(), { signal: abort.signal }),
            );
            await Promise.race([
                providerStarted,
                first.then(async (response) => {
                    if (executions === 0)
                        throw new Error(
                            `Owner returned before provider: ${response.status} ${await response.text()}`,
                        );
                }),
            ]);
            const ids = await listDurableObjectIds(env.GENERATION_COORDINATOR);
            expect(ids).toHaveLength(1);
            const stub = env.GENERATION_COORDINATOR.get(ids[0]);
            const stored = await runInDurableObject(
                stub,
                async (_coordinator, state) =>
                    state.storage.get<{
                        bodyChunks: number;
                        started: boolean;
                        cache: GenerationJob["cache"];
                    }>("job"),
            );
            if (!stored) throw new Error("Generation job was not persisted");
            expect(stored.started).toBe(true);
            expect(stored.bodyChunks).toBeGreaterThan(29);
            let disconnectError: Error | undefined;
            const firstSettled = first.catch((error: Error) => {
                disconnectError = error;
            });
            abort.abort();
            await vi.waitFor(
                () => expect(disconnectError?.name).toBe("AbortError"),
                { timeout: 3000 },
            );
            const secondContext = createExecutionContext();
            const second = worker.fetch(request(), env, secondContext);
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
                release();
            }
            const response = await second;
            expect(
                response.status,
                response.status === 200 ? "" : await response.text(),
            ).toBe(200);
            const result = (
                await response.json<{
                    data: { url?: string; b64_json?: string }[];
                }>()
            ).data[0];
            if (responseFormat === "url")
                expect(result.url).toContain("media.pollinations.ai/");
            else
                expect(result.b64_json?.length).toBe(
                    Math.ceil(output.length / 3) * 4,
                );
            await Promise.all([
                firstSettled,
                waitOnExecutionContext(secondContext),
            ]);
            const cacheContext = createExecutionContext();
            const cached = await worker.fetch(request(), env, cacheContext);
            expect(cached.status).toBe(200);
            expect(cached.headers.get("x-cache")).toBe("HIT");
            await cached.text();
            await waitOnExecutionContext(cacheContext);
            const billed = tinybird.state.events.filter(
                (event) => event.isBilledUsage,
            );
            expect(executions).toBe(1);
            expect(requestBytes).toBeGreaterThan(29_700_000);
            expect(billed).toHaveLength(1);
            expect(billed[0].totalPrice).toBeGreaterThan(0);
            const after = await getUserBalance(drizzle(env.DB), userId);
            expect(before.packBalance - after.packBalance).toBeCloseTo(
                billed[0].totalPrice,
                8,
            );
            expect(after.tierBalance).toBe(before.tierBalance);
            const file = await env.MEDIA.get(stored.cache.key);
            expect(file?.status).toBe(200);
            if (!file) throw new Error("Generated file was not cached");
            const bytes = await file.arrayBuffer();
            expect(bytes.byteLength).toBe(output.length);
            expect(await crypto.subtle.digest("SHA-256", bytes)).toEqual(
                await crypto.subtle.digest("SHA-256", output),
            );
            const remaining = await runInDurableObject(
                stub,
                async (_coordinator, state) => [
                    ...(await state.storage.list()).keys(),
                ],
            );
            expect(remaining).toEqual([]);
        },
        60_000,
    );
    it("finds completed media through the real storage RPC service", async () => {
        const key = "d".repeat(64);
        await env.MEDIA.put(
            key,
            new Response("generated-image", {
                headers: { "Content-Type": "image/png" },
            }),
        );
        const job = testJob(key);
        job.cache.storage = "media";
        const stub = env.GENERATION_COORDINATOR.getByName(
            `media-${crypto.randomUUID()}`,
        );
        expect(
            await runInDurableObject(stub, (coordinator) =>
                coordinator.startAndWait(job),
            ),
        ).toEqual({ status: "cached" });
        const response = await env.MEDIA.get(key);
        expect(response?.headers.get("Link")).toBe(
            `<https://media.pollinations.ai/${key}>; rel="enclosure"`,
        );
        expect(await response?.text()).toBe("generated-image");
    });

    it("streams files above the RPC value-size limit through media storage", async () => {
        const key = "e".repeat(64);
        const size = 33 * 1024 * 1024;
        await env.MEDIA.put(
            key,
            new Response(new Uint8Array(size), {
                headers: { "Content-Type": "video/mp4" },
            }),
        );
        const response = await env.MEDIA.get(key);
        expect(response?.headers.get("x-content-size")).toBe(String(size));
        if (!response?.body) throw new Error("Stored video is missing");
        const reader = response.body.getReader();
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
        }
        expect(received).toBe(size);
    });
    it("returns an existing cached generation without scheduling work", async () => {
        const key = `cached-${crypto.randomUUID()}`;
        await env.TEXT_BUCKET.put(key, "cached");
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );

        const result = await runInDurableObject(stub, (coordinator) =>
            coordinator.startAndWait(testJob(key)),
        );

        expect(result).toEqual({ status: "cached" });
    });

    it("joins concurrent callers for the same cache identity", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const job = testJob(`missing-${crypto.randomUUID()}`);

        const results = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const owner = coordinator.startAndWait(job);
                const joiner = coordinator.startAndWait(job);
                await waitForAlarm(state);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return Promise.all([owner, joiner]);
            },
        );
        expect(results.every((result) => result.status === "failed")).toBe(
            true,
        );
    });

    it("does not execute a generation again after an alarm interruption", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const key = `interrupted-${crypto.randomUUID()}`;

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const pending = coordinator.startAndWait(testJob(key));
                await waitForAlarm(state);
                const job =
                    await state.storage.get<Record<string, unknown>>("job");
                await state.storage.put("job", { ...job, started: true });

                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return pending;
            },
        );

        expect(result.status).toBe("failed");
        if (result.status !== "failed") return;
        expect(new TextDecoder().decode(result.error.body)).toBe(
            "Detached generation was interrupted",
        );
        expect(await env.TEXT_BUCKET.head(key)).toBeNull();
    });

    it("persists request bodies larger than one storage value", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const status = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                await state.storage.put("sentinel", "keep");
                const result = coordinator.startAndWait(
                    testJob(
                        `large-${crypto.randomUUID()}`,
                        "x".repeat(2_100_000),
                    ),
                );
                await waitForAlarm(state);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return (await result).status;
            },
        );

        expect(status).toBe("failed");
        const remaining = await runInDurableObject(
            stub,
            async (_coordinator, state) => ({
                sentinel: await state.storage.get("sentinel"),
                job: await state.storage.get("job"),
                body: await state.storage.get("body:0"),
                alarm: await state.storage.getAlarm(),
            }),
        );
        expect(remaining).toEqual({
            sentinel: "keep",
            job: undefined,
            body: undefined,
            alarm: null,
        });
    });
});
