import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { type ErrorVariables, handleError } from "@shared/error.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import {
    createGenerationCache,
    type GenerationCacheAdapter,
    type GenerationCacheVariables,
    prepareGenerationRequest,
} from "@/middleware/generation-cache.ts";
import {
    deduplicateGeneration,
    type GenerationJob,
} from "@/middleware/generation-deduplication.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables &
        ErrorVariables &
        RequestIdVariables &
        AuthVariables &
        BalanceVariables &
        GenerationCacheVariables & {
            track: { streamRequested: boolean };
            formData?: FormData;
        };
};

function executionContext(): ExecutionContext {
    return {
        waitUntil() {},
        passThroughOnException() {},
    } as unknown as ExecutionContext;
}

function createAdapter(cache: Map<string, string>): GenerationCacheAdapter {
    return {
        storage: "text",
        label: "test-cache",
        getKey: () => "same-request",
        get: async (_c, key) => {
            const body = cache.get(key);
            return body
                ? new Response(body, { headers: { "X-Cache": "HIT" } })
                : null;
        },
        shouldCache: (response) => response.ok,
        capture: (_c, key, response) => ({
            response,
            write: Promise.resolve().then(() => {
                cache.set(key, "origin");
            }),
        }),
    };
}

function createApp(
    adapter: GenerationCacheAdapter,
    stream = false,
    executorBody?: string,
) {
    let preflights = 0;
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "request-1");
            c.set("balance", {
                getBalance: async () => ({
                    tierBalance: 1,
                    packBalance: 2,
                }),
                balanceCheckResult: {
                    selectedMeterId: "local:tier",
                    selectedMeterSlug: "v1:meter:tier",
                    balances: { "v1:meter:tier": 1, "v1:meter:pack": 2 },
                },
                apiKeyBudgetEstimate: 0.25,
            });
            c.set("track", { streamRequested: stream });
            if (executorBody) c.set("generationRequestBody", executorBody);
            c.set("auth", {
                user: { id: "user-1", tier: "seed" } as never,
                apiKey: { id: "key-1", rawKey: "pk-secret" },
                requireUser: () => ({ id: "user-1", tier: "seed" }) as never,
                requireModelAccess: () => {},
            });
            await next();
        })
        .all(
            "/generate",
            createGenerationCache(adapter),
            async (_c, next) => {
                preflights += 1;
                await next();
            },
            deduplicateGeneration,
            () => {
                originHits += 1;
                return new Response("origin");
            },
        );
    return {
        app,
        get preflights() {
            return preflights;
        },
        get originHits() {
            return originHits;
        },
    };
}

describe("generation request deduplication", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("authorizes every caller but starts one detached generation", async () => {
        const cache = new Map<string, string>();
        const jobs: GenerationJob[] = [];
        let active: Promise<void> | undefined;
        let owners = 0;
        const coordinator = {
            async startAndWait(job: GenerationJob) {
                jobs.push(job);
                if (!active) {
                    owners += 1;
                    active = Promise.resolve().then(() => {
                        cache.set("same-request", "generated-once");
                    });
                }
                await active;
                return { status: "cached" as const };
            },
        };
        const generation = createApp(
            createAdapter(cache),
            false,
            JSON.stringify({
                model: "resolved-model",
                prompt: "hello",
                seed: 123,
                key: "body-secret",
            }),
        );
        const bindings = {
            GENERATION_COORDINATOR: { getByName: () => coordinator },
        } as unknown as CloudflareBindings;
        const request = () =>
            new Request(
                "https://gen.pollinations.ai/generate?model=test&key=query-secret",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer header-secret",
                        "CF-Connecting-IP": "203.0.113.42",
                        "Content-Type": "application/json",
                        "X-Forwarded-Host": "gen.pollinations.ai",
                        "X-Original-Client-IP": "203.0.113.42",
                    },
                    body: JSON.stringify({
                        model: "test",
                        prompt: "hello",
                        key: "body-secret",
                    }),
                },
            );

        const [owner, joiner] = await Promise.all([
            generation.app.fetch(request(), bindings, executionContext()),
            generation.app.fetch(request(), bindings, executionContext()),
        ]);

        expect(await owner.text()).toBe("generated-once");
        expect(await joiner.text()).toBe("generated-once");
        expect(generation.preflights).toBe(2);
        expect(generation.originHits).toBe(0);
        expect(owners).toBe(1);
        expect(owner.headers.get("X-Cache-Type")).toBeNull();
        expect(joiner.headers.get("X-Cache-Type")).toBeNull();
        expect(owner.headers.get("X-Cache")).toBe("HIT");
        expect(joiner.headers.get("X-Cache")).toBe("HIT");
        expect(jobs[0].request.url).toBe(
            "https://gen.pollinations.ai/generate?model=test",
        );
        expect(jobs[0].request.headers).not.toContainEqual([
            "authorization",
            "Bearer header-secret",
        ]);
        expect(jobs[0].request.headers).toEqual(
            expect.arrayContaining([
                ["cf-connecting-ip", "203.0.113.42"],
                ["x-forwarded-host", "gen.pollinations.ai"],
                ["x-original-client-ip", "203.0.113.42"],
            ]),
        );
        expect(jobs[0].auth.apiKey).not.toHaveProperty("rawKey");
        expect(jobs[0].requestId).toBe("request-1");
        expect(jobs[0].balanceCheckResult.balances).toEqual({
            "v1:meter:tier": 1,
            "v1:meter:pack": 2,
        });
        expect(jobs[0].apiKeyBudgetEstimate).toBe(0.25);
        expect(new TextDecoder().decode(jobs[0].request.body)).toBe(
            JSON.stringify({
                model: "resolved-model",
                prompt: "hello",
                seed: 123,
            }),
        );
    });

    it("leaves explicit streams on the direct request path", async () => {
        const cache = new Map<string, string>();
        let starts = 0;
        const generation = createApp(createAdapter(cache), true);
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    startAndWait: async () => {
                        starts += 1;
                        return { status: "cached" };
                    },
                }),
            },
        } as unknown as CloudflareBindings;

        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            bindings,
            executionContext(),
        );

        expect(await response.text()).toBe("origin");
        expect(starts).toBe(0);
        expect(generation.originHits).toBe(1);
    });

    it("replays multipart files without putting API keys in the job", async () => {
        const cache = new Map<string, string>();
        const jobs: GenerationJob[] = [];
        const adapter = createAdapter(cache);
        adapter.getKey = (c) => c.var.generationCacheBody ?? "";
        const app = new Hono<TestEnv>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "request-1");
                c.set("balance", {
                    getBalance: async () => ({
                        tierBalance: 1,
                        packBalance: 2,
                    }),
                    balanceCheckResult: {
                        selectedMeterId: "local:tier",
                        selectedMeterSlug: "v1:meter:tier",
                        balances: {
                            "v1:meter:tier": 1,
                            "v1:meter:pack": 2,
                        },
                    },
                });
                c.set("track", { streamRequested: false });
                c.set("formData", await c.req.formData());
                c.set("auth", {
                    user: { id: "user-1", tier: "seed" } as never,
                    apiKey: { id: "key-1", rawKey: "pk-secret" },
                    requireUser: () =>
                        ({ id: "user-1", tier: "seed" }) as never,
                    requireModelAccess: () => {},
                });
                await next();
            })
            .post(
                "/upload",
                prepareGenerationRequest,
                createGenerationCache(adapter),
                deduplicateGeneration,
            );
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    startAndWait: async (job: GenerationJob) => {
                        jobs.push(job);
                        cache.set(job.cache.key, "generated");
                        return { status: "cached" as const };
                    },
                }),
            },
        } as unknown as CloudflareBindings;
        const form = new FormData();
        form.append("model", "voice-transform");
        form.append("key", "body-secret");
        form.append(
            "audio",
            new File([new Uint8Array([1, 2, 3])], "voice.wav", {
                type: "audio/wav",
            }),
        );

        const response = await app.fetch(
            new Request("https://gen.pollinations.ai/upload", {
                method: "POST",
                body: form,
            }),
            bindings,
            executionContext(),
        );

        expect(await response.text()).toBe("generated");
        expect(jobs).toHaveLength(1);
        const job = jobs[0];
        const contentType = new Headers(job.request.headers).get(
            "content-type",
        );
        expect(contentType).toContain("multipart/form-data; boundary=");
        const replayed = await new Request(job.request.url, {
            method: "POST",
            headers: job.request.headers,
            body: job.request.body?.slice().buffer,
        }).formData();
        expect(replayed.get("key")).toBeNull();
        expect(replayed.get("model")).toBe("voice-transform");
        const audio = replayed.get("audio");
        expect(audio).toBeInstanceOf(File);
        expect(new Uint8Array(await (audio as File).arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3]),
        );
    });

    it("fails closed when the coordinator binding is missing", async () => {
        const generation = createApp(createAdapter(new Map()));

        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            {} as CloudflareBindings,
            executionContext(),
        );

        expect(response.status).toBe(503);
        expect(await response.text()).toBe(
            "Generation coordination is unavailable",
        );
        expect(generation.originHits).toBe(0);
    });

    it("preserves a detached generation error for every caller", async () => {
        const generation = createApp(createAdapter(new Map()));
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    startAndWait: async () => ({
                        status: "failed",
                        error: {
                            httpStatus: 422,
                            headers: [
                                ["content-type", "application/json"],
                                ["retry-after", "30"],
                            ],
                            body: new TextEncoder().encode(
                                JSON.stringify({ error: "blocked" }),
                            ),
                        },
                    }),
                }),
            },
        } as unknown as CloudflareBindings;

        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            bindings,
            executionContext(),
        );

        expect(response.status).toBe(422);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
        expect(response.headers.get("retry-after")).toBe("30");
        expect(response.headers.get("x-cache-type")).toBeNull();
        expect(await response.json()).toEqual({ error: "blocked" });
    });

    it("keeps connected callers waiting past 90 seconds", async () => {
        vi.useFakeTimers();
        let coordinatorName = "";
        const cache = new Map<string, string>();
        let finish!: (result: { status: "cached" }) => void;
        const generation = createApp(createAdapter(cache));
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: (name: string) => {
                    coordinatorName = name;
                    return {
                        startAndWait: () =>
                            new Promise((resolve) => {
                                finish = resolve;
                            }),
                    };
                },
            },
        } as unknown as CloudflareBindings;

        let settled = false;
        const responsePromise = Promise.resolve(
            generation.app.fetch(
                new Request("https://gen.pollinations.ai/generate"),
                bindings,
                executionContext(),
            ),
        );
        void responsePromise.then(() => {
            settled = true;
        });
        await vi.waitFor(() => {
            expect(finish).toBeTypeOf("function");
        });
        await vi.advanceTimersByTimeAsync(3 * 60_000);
        expect(settled).toBe(false);

        cache.set("same-request", "generated-after-three-minutes");
        finish({ status: "cached" });
        const response = await responsePromise;

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("generated-after-three-minutes");
        expect(coordinatorName).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns 503 when coordination fails without starting a direct generation", async () => {
        const generation = createApp(createAdapter(new Map()));
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    startAndWait: async () => {
                        throw new Error("rpc reset");
                    },
                }),
            },
        } as unknown as CloudflareBindings;

        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            bindings,
            executionContext(),
        );

        expect(response.status).toBe(503);
        expect(await response.text()).toBe(
            "Generation coordination is unavailable",
        );
        expect(generation.originHits).toBe(0);
    });

    it.each([
        "rpc",
        "completed-cache",
        "initial-cache",
        "rpc-and-cache",
    ])("preserves the underlying %s failure in Tinybird without restarting generation", async (failure) => {
        const rpcError = Object.assign(new Error("RPC connection reset"), {
            durableObjectReset: true,
            overloaded: false,
            retryable: true,
        });
        const cacheError = new Error("R2 read failed");
        const adapter = createAdapter(new Map());
        const get = vi.spyOn(adapter, "get").mockImplementation(async () => {
            if (
                failure === "initial-cache" ||
                (get.mock.calls.length === 2 && failure !== "rpc")
            ) {
                throw cacheError;
            }
            return null;
        });
        const startAndWait = vi.fn(async () => {
            if (failure.startsWith("rpc")) throw rpcError;
            return { status: "cached" };
        });
        const requests: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                requests.push(new Request(input, init));
                return new Response("ok");
            },
        );
        const generation = createApp(adapter);
        generation.app.onError(handleError);
        const ctx = createExecutionContext();
        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            {
                ENVIRONMENT: "test",
                TINYBIRD_INGEST_URL:
                    "https://tinybird.test/v0/events?name=generation_event_v2",
                TINYBIRD_INGEST_TOKEN: "test_tinybird_token",
                GENERATION_COORDINATOR: { getByName: () => ({ startAndWait }) },
            } as unknown as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(503);
        const body = await response.text();
        expect(body).toContain(
            failure === "rpc"
                ? "Generation coordination is unavailable"
                : "Generation cache is temporarily unavailable",
        );
        expect(body).not.toContain("RPC connection reset");
        expect(body).not.toContain("R2 read failed");
        expect(requests).toHaveLength(1);
        expect(new URL(requests[0].url).searchParams.get("name")).toBe(
            "error_event",
        );
        const event = (await requests[0].json()) as { stack: string };
        expect(event.stack).toContain(
            failure === "rpc" ? rpcError.message : cacheError.message,
        );
        if (failure === "rpc") {
            expect(event.stack).toContain(
                "durableObjectReset=true overloaded=false retryable=true",
            );
        }
        expect(startAndWait).toHaveBeenCalledTimes(
            failure === "initial-cache" ? 0 : 1,
        );
        expect(get).toHaveBeenCalledTimes(failure === "initial-cache" ? 1 : 2);
        expect(generation.originHits).toBe(0);
    });

    it("reads a saved result once after an RPC failure without restarting generation", async () => {
        const cache = new Map<string, string>();
        const adapter = createAdapter(cache);
        const get = vi.spyOn(adapter, "get");
        const capture = vi.spyOn(adapter, "capture");
        const startAndWait = vi.fn(async () => {
            cache.set("same-request", "generated-once");
            throw new Error("rpc reset after completion");
        });
        const generation = createApp(adapter);
        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate"),
            {
                GENERATION_COORDINATOR: { getByName: () => ({ startAndWait }) },
            } as unknown as CloudflareBindings,
            executionContext(),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("generated-once");
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expect(startAndWait).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledTimes(2);
        expect(capture).not.toHaveBeenCalled();
        expect(generation.originHits).toBe(0);
    });
});
