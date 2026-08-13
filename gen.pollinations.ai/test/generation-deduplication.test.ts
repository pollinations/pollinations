import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import {
    createGenerationCache,
    type GenerationCacheAdapter,
    type GenerationCacheVariables,
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
        RequestIdVariables &
        AuthVariables &
        GenerationCacheVariables & {
            track: { streamRequested: boolean };
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
        get: async (c, key) => {
            const body = cache.get(key);
            if (body) c.header("X-Cache-Type", "EXACT");
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
    replayBody?: string,
) {
    let preflights = 0;
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "request-1");
            c.set("track", { streamRequested: stream });
            if (replayBody) c.set("generationReplayBody", replayBody);
            c.set("auth", {
                user: { id: "user-1", tier: "seed" } as never,
                apiKey: { id: "key-1", rawKey: "pk-secret" },
                requireAuthorization: async () => {},
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
    });

    it("authorizes every caller but starts one detached generation", async () => {
        const cache = new Map<string, string>();
        const jobs: GenerationJob[] = [];
        let active: Promise<void> | undefined;
        let owners = 0;
        const coordinator = {
            async startAndWait(job: GenerationJob) {
                jobs.push(job);
                const role = active ? "joiner" : "owner";
                if (!active) {
                    owners += 1;
                    active = Promise.resolve().then(() => {
                        cache.set("same-request", "generated-once");
                    });
                }
                await active;
                return { role, outcome: { status: "cached" as const } };
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
        expect(
            new Set([
                owner.headers.get("X-Cache-Type"),
                joiner.headers.get("X-Cache-Type"),
            ]),
        ).toEqual(new Set(["GENERATED", "COALESCED"]));
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
        expect(jobs[0].request.body).toBe(
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
                        return {
                            role: "owner",
                            outcome: { status: "cached" },
                        };
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
                        role: "owner",
                        outcome: {
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
        expect(await response.json()).toEqual({ error: "blocked" });
    });

    it("keeps connected callers waiting past 90 seconds", async () => {
        vi.useFakeTimers();
        let coordinatorName = "";
        const cache = new Map<string, string>();
        let finish!: (result: {
            role: "owner";
            outcome: { status: "cached" };
        }) => void;
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
        finish({ role: "owner", outcome: { status: "cached" } });
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
});
