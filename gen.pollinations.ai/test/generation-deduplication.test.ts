import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
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

function createApp(adapter: GenerationCacheAdapter, stream = false) {
    let preflights = 0;
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "request-1");
            c.set("track", { streamRequested: stream });
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
        const generation = createApp(createAdapter(cache));
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
                        "Content-Type": "application/json",
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
        expect(jobs[0].request.url).toBe(
            "https://gen.pollinations.ai/generate?model=test",
        );
        expect(jobs[0].request.headers).not.toContainEqual([
            "authorization",
            "Bearer header-secret",
        ]);
        expect(jobs[0].auth.apiKey).not.toHaveProperty("rawKey");
        expect(jobs[0].request.body).toBe(
            JSON.stringify({ model: "test", prompt: "hello" }),
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
});
