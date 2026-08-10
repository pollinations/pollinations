import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import {
    createGenerationCache,
    type GenerationCacheAdapter,
} from "@/middleware/generation-cache.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type {
    GenerationCoordinatorStatus,
    GenerationJob,
} from "@/utils/idempotent-generation.ts";

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
        AuthVariables & {
            track: { streamRequested: boolean };
        };
};

type CoordinatorStub = {
    start(job: GenerationJob): Promise<{ role: "owner" | "joiner" }>;
    getStatus(): Promise<GenerationCoordinatorStatus>;
};

function executionContext(): ExecutionContext {
    return {
        waitUntil() {},
        passThroughOnException() {},
    } as unknown as ExecutionContext;
}

function createApp(adapter: GenerationCacheAdapter, streamRequested = false) {
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "outer-request");
            c.set("track", { streamRequested });
            c.set("auth", {
                user: { id: "user-1", tier: "seed" } as never,
                apiKey: { id: "key-1", rawKey: "pk-secret" },
                requireAuthorization: async () => {},
                requireUser: () => ({ id: "user-1" }) as never,
                requireModelAccess: () => {},
            });
            await next();
        })
        .all("/generate", createGenerationCache(adapter), () => {
            originHits += 1;
            return new Response("origin", {
                headers: {
                    "Content-Type": streamRequested
                        ? "text/event-stream"
                        : "text/plain",
                },
            });
        });
    return {
        app,
        get originHits() {
            return originHits;
        },
    };
}

describe("idempotent generation", () => {
    it("elects one owner and serves owner and joiner from the completed cache", async () => {
        const cache = new Map<string, string>();
        const jobs: GenerationJob[] = [];
        let active = false;
        let owners = 0;
        const coordinator: CoordinatorStub = {
            async start(job) {
                jobs.push(job);
                if (active) return { role: "joiner" };
                active = true;
                owners += 1;
                setTimeout(() => {
                    cache.set("same-request", "generated-once");
                    active = false;
                }, 10);
                return { role: "owner" };
            },
            async getStatus() {
                return { status: active ? "running" : "idle" };
            },
        };
        const adapter: GenerationCacheAdapter = {
            namespace: "test",
            label: "test-cache",
            getKey: () => "same-request",
            get: async (_c, key) => {
                const body = cache.get(key);
                return body
                    ? new Response(body, { headers: { "X-Cache": "HIT" } })
                    : null;
            },
            shouldCache: () => true,
            capture: (_c, key, response) => ({
                response,
                write: Promise.resolve().then(() => {
                    cache.set(key, "origin");
                }),
            }),
        };
        const generation = createApp(adapter);
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => coordinator,
            },
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
        expect(owners).toBe(1);
        expect(generation.originHits).toBe(0);
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

    it("leaves explicit text streams on the direct path", async () => {
        let starts = 0;
        const adapter: GenerationCacheAdapter = {
            namespace: "text",
            label: "text-cache",
            getKey: () => "stream-request",
            get: async () => null,
            shouldCache: () => true,
            capture: (_c, _key, response) => ({
                response,
                write: Promise.resolve(),
            }),
        };
        const generation = createApp(adapter, true);
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    start: async () => {
                        starts += 1;
                        return { role: "owner" };
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

    it("fails closed when a request is too large to persist safely", async () => {
        let starts = 0;
        const adapter: GenerationCacheAdapter = {
            namespace: "text",
            label: "text-cache",
            getKey: () => "large-request",
            get: async () => null,
            shouldCache: () => true,
            capture: (_c, _key, response) => ({
                response,
                write: Promise.resolve(),
            }),
        };
        const generation = createApp(adapter);
        const bindings = {
            GENERATION_COORDINATOR: {
                getByName: () => ({
                    start: async () => {
                        starts += 1;
                        return { role: "owner" };
                    },
                }),
            },
        } as unknown as CloudflareBindings;

        const response = await generation.app.fetch(
            new Request("https://gen.pollinations.ai/generate", {
                method: "POST",
                body: "x".repeat(1_500_001),
            }),
            bindings,
            executionContext(),
        );

        expect(response.status).toBe(413);
        expect(starts).toBe(0);
        expect(generation.originHits).toBe(0);
    });
});
