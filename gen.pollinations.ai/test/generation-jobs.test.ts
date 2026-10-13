import type { Logger } from "@logtape/logtape";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import {
    createGenerationCache,
    type GenerationCacheAdapter,
    type GenerationCacheVariables,
    hashGenerationCacheIdentity,
} from "@/middleware/generation-cache.ts";
import {
    deduplicateGeneration,
    type GenerationCacheIdentity,
    type GenerationErrorSnapshot,
    type GenerationJobHead,
    type GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { getJob, getJobResult } from "@/routes/jobs.ts";

const CACHE_KEY = "media/cache-key-1";

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
        AuthVariables &
        BalanceVariables &
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

/** In-memory R2-like store keyed by cache key. */
function createMedia(store: Map<string, Uint8Array>) {
    return {
        async has(key: string) {
            return store.has(key);
        },
        async get(key: string) {
            const body = store.get(key);
            return body
                ? new Response(body as unknown as BodyInit, {
                      headers: {
                          "content-type": "image/png",
                          "X-Cache": "HIT",
                      },
                  })
                : null;
        },
    } as unknown as CloudflareBindings["MEDIA"];
}

function mediaAdapter(store: Map<string, Uint8Array>): GenerationCacheAdapter {
    return {
        storage: "media",
        label: "media-cache",
        getKey: () => CACHE_KEY,
        get: async (_c, key) => {
            const body = store.get(key);
            return body
                ? new Response(body as unknown as BodyInit, {
                      headers: {
                          "content-type": "image/png",
                          "X-Cache": "HIT",
                      },
                  })
                : null;
        },
        shouldCache: (response) =>
            response.ok &&
            (response.headers.get("content-type")?.startsWith("image/") ??
                false),
        capture: (_c, key, response) => ({
            response,
            write: Promise.resolve().then(async () => {
                store.set(
                    key,
                    new Uint8Array(await response.clone().arrayBuffer()),
                );
            }),
        }),
    };
}

/**
 * Mirrors GenerationCoordinator's contract: one detached execution per cache
 * identity, owner-gated reads, and a status that outlives the job.
 */
function fakeCoordinator(store: Map<string, Uint8Array>, gate: Promise<void>) {
    const state = new Map<
        string,
        {
            cache: GenerationCacheIdentity;
            owners: Set<string>;
            started: boolean;
            error?: GenerationErrorSnapshot;
        }
    >();
    let charges = 0;

    const record = (name: string, cache: GenerationCacheIdentity) => {
        let entry = state.get(name);
        if (!entry) {
            entry = { cache, owners: new Set(), started: false };
            state.set(name, entry);
        }
        return entry;
    };

    return {
        get charges() {
            return charges;
        },
        getByName(name: string) {
            return {
                async submit(
                    head: GenerationJobHead,
                    body: ReadableStream<Uint8Array> | undefined,
                    owner: string,
                ): Promise<
                    | { state: "pending" }
                    | { state: "succeeded"; cache: GenerationCacheIdentity }
                > {
                    const entry = record(name, head.cache);
                    entry.owners.add(owner);
                    if (store.has(head.cache.key)) {
                        await body?.cancel();
                        return { state: "succeeded", cache: head.cache };
                    }
                    if (!entry.started) {
                        entry.started = true;
                        charges += 1;
                        void gate.then(() => {
                            store.set(
                                head.cache.key,
                                new TextEncoder().encode("generated-bytes"),
                            );
                        });
                    }
                    await body?.cancel();
                    return { state: "pending" };
                },
                async status(
                    owner: string,
                ): Promise<
                    | { state: "pending" }
                    | { state: "succeeded"; cache: GenerationCacheIdentity }
                    | { state: "failed"; error: GenerationErrorSnapshot }
                    | null
                > {
                    const entry = state.get(name);
                    if (!entry?.owners.has(owner)) return null;
                    if (!store.has(entry.cache.key)) {
                        return entry.started ? { state: "pending" } : null;
                    }
                    return { state: "succeeded", cache: entry.cache };
                },
                async startAndWait(
                    head: GenerationJobHead,
                ): Promise<GenerationOutcome> {
                    if (store.has(head.cache.key)) return { status: "cached" };
                    const entry = record(name, head.cache);
                    if (!entry.started) {
                        entry.started = true;
                        charges += 1;
                    }
                    await gate;
                    store.set(
                        head.cache.key,
                        new TextEncoder().encode("generated-bytes"),
                    );
                    return { status: "cached" };
                },
            };
        },
    };
}

function createApp(store: Map<string, Uint8Array>) {
    const adapter = mediaAdapter(store);
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "request-1");
            c.set("balance", {
                getBalance: async () => ({ tierBalance: 1, packBalance: 2 }),
                balanceCheckResult: {
                    selectedMeterId: "local:tier",
                    selectedMeterSlug: "v1:meter:tier",
                    balances: { "v1:meter:tier": 1, "v1:meter:pack": 2 },
                },
                apiKeyBudgetEstimate: 0.25,
            });
            c.set("track", { streamRequested: false });
            c.set("auth", {
                user: { id: c.req.header("x-test-user") ?? "user-1" } as never,
                requireUser: () =>
                    ({
                        id: c.req.header("x-test-user") ?? "user-1",
                        tier: "seed",
                    }) as never,
                requireModelAccess: () => {},
            });
            await next();
        })
        .post(
            "/generate",
            createGenerationCache(adapter),
            deduplicateGeneration,
            () =>
                new Response("origin-bytes", {
                    headers: { "content-type": "image/png" },
                }),
        )
        .get("/v1/jobs/:id", getJob)
        .get("/v1/jobs/:id/result", getJobResult);
    return app;
}

function submitRequest(preferAsync: boolean, user = "user-1") {
    return new Request("https://gen.pollinations.ai/generate", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(preferAsync && { prefer: "respond-async" }),
            "x-test-user": user,
        },
        body: JSON.stringify({ model: "test", prompt: "hello" }),
    });
}

describe("async media jobs", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("submits once, gates by owner, and serves the result", async () => {
        const store = new Map<string, Uint8Array>();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const coordinator = fakeCoordinator(store, gate);
        const id = await hashGenerationCacheIdentity("media", CACHE_KEY);
        const bindings = {
            GENERATION_COORDINATOR: coordinator,
            MEDIA: createMedia(store),
        } as unknown as CloudflareBindings;
        const app = createApp(store);

        const submitted = await app.fetch(
            submitRequest(true),
            bindings,
            executionContext(),
        );
        expect(submitted.status).toBe(202);
        expect(submitted.headers.get("location")).toBe(
            `https://gen.pollinations.ai/v1/jobs/${id}`,
        );
        expect(await submitted.json()).toEqual({
            id,
            status: "pending",
            status_url: `https://gen.pollinations.ai/v1/jobs/${id}`,
            result_url: `https://gen.pollinations.ai/v1/jobs/${id}/result`,
        });

        const pending = await app.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${id}`, {
                headers: { "x-test-user": "user-1" },
            }),
            bindings,
            executionContext(),
        );
        expect(pending.status).toBe(200);
        expect(await pending.json()).toMatchObject({ status: "pending" });

        // A different account cannot read the job.
        const foreign = await app.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${id}`, {
                headers: { "x-test-user": "user-2" },
            }),
            bindings,
            executionContext(),
        );
        expect(foreign.status).toBe(404);

        release();
        await gate;

        const done = await app.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${id}`, {
                headers: { "x-test-user": "user-1" },
            }),
            bindings,
            executionContext(),
        );
        expect(done.status).toBe(200);
        expect(await done.json()).toEqual({
            id,
            status: "succeeded",
            result_url: `https://gen.pollinations.ai/v1/jobs/${id}/result`,
        });

        const result = await app.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${id}/result`, {
                headers: { "x-test-user": "user-1" },
            }),
            bindings,
            executionContext(),
        );
        expect(result.status).toBe(200);
        expect(result.headers.get("content-type")).toBe("image/png");
        expect(await result.text()).toBe("generated-bytes");
        // One generation and one charge, however often it was polled.
        expect(coordinator.charges).toBe(1);
    });

    it("re-submitting the identical request joins the job instead of charging again", async () => {
        const store = new Map<string, Uint8Array>();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const coordinator = fakeCoordinator(store, gate);
        const bindings = {
            GENERATION_COORDINATOR: coordinator,
            MEDIA: createMedia(store),
        } as unknown as CloudflareBindings;
        const app = createApp(store);

        const first = await app.fetch(
            submitRequest(true),
            bindings,
            executionContext(),
        );
        const second = await app.fetch(
            submitRequest(true),
            bindings,
            executionContext(),
        );
        expect(first.status).toBe(202);
        expect(second.status).toBe(202);
        expect(coordinator.charges).toBe(1);
        release();
        await gate;
    });

    it("returns a cached result directly and keeps sync requests synchronous", async () => {
        const store = new Map<string, Uint8Array>([
            [CACHE_KEY, new TextEncoder().encode("already-cached")],
        ]);
        const coordinator = fakeCoordinator(store, Promise.resolve());
        const bindings = {
            GENERATION_COORDINATOR: coordinator,
            MEDIA: createMedia(store),
        } as unknown as CloudflareBindings;
        const app = createApp(store);

        const response = await app.fetch(
            submitRequest(false),
            bindings,
            executionContext(),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("already-cached");
        expect(coordinator.charges).toBe(0);
    });
});
