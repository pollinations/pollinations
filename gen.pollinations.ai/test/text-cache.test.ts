import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { validator } from "@/middleware/validator.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type CachedObject = {
    body: Uint8Array;
    customMetadata?: Record<string, string>;
    uploaded: Date;
};

function createTextBucket(): R2Bucket {
    const objects = new Map<string, CachedObject>();

    return {
        get: async (key: string) => {
            const object = objects.get(key);
            if (!object) return null;
            return {
                ...object,
                body: object.body.slice(),
            };
        },
        put: async (key: string, value: BodyInit, options?: R2PutOptions) => {
            const body = new Uint8Array(
                await new Response(value).arrayBuffer(),
            );
            objects.set(key, {
                body,
                customMetadata: options?.customMetadata,
                uploaded: new Date(),
            });
            return null;
        },
    } as unknown as R2Bucket;
}

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

function createTextCacheApp() {
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            await next();
        })
        .post(
            "/v1/chat/completions",
            validator("json", CreateChatCompletionRequestSchema),
            textCache,
            async (c) => {
                originHits += 1;
                return new Response(
                    JSON.stringify({
                        originHits,
                        body: await c.req.text(),
                    }),
                    {
                        headers: {
                            "Content-Type": "application/json; charset=utf-8",
                            "x-model-used": "openai-fast",
                            "x-usage-prompt-text-tokens": "12",
                            "x-moderation-hate-severity": "safe",
                        },
                    },
                );
            },
        )
        .get("/text/:prompt", textCache, async (c) => {
            originHits += 1;
            return new Response(`hit:${originHits}:${c.req.param("prompt")}`, {
                headers: { "Content-Type": "text/plain" },
            });
        })
        .get("/v1/models", async () => Response.json({ data: [] }));

    return {
        app,
        get originHits() {
            return originHits;
        },
    };
}

function createTextCacheEnv(): CloudflareBindings {
    return {
        TEXT_BUCKET: createTextBucket(),
    } as CloudflareBindings;
}

async function dispatch(
    app: Hono<TestEnv>,
    path: string,
    init?: RequestInit,
    env = createTextCacheEnv(),
) {
    const ctx = createExecutionContext();
    const response = await app.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );

    return {
        response,
        wait: () => waitOnExecutionContext(ctx),
    };
}

async function consumeAndWait(result: Awaited<ReturnType<typeof dispatch>>) {
    const text = await result.response.text();
    await result.wait();
    return text;
}

function chatInit(body: unknown): RequestInit {
    return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

describe("text cache", () => {
    it("serves cached responses before auth while misses still require auth", async () => {
        let originHits = 0;
        const app = new Hono<TestEnv>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "test-request");
                await next();
            })
            .post(
                "/v1/chat/completions",
                validator("json", CreateChatCompletionRequestSchema),
                textCache,
                async (c, next) => {
                    if (c.req.header("authorization") !== "Bearer test-key") {
                        return Response.json(
                            { error: "Authentication required" },
                            { status: 401 },
                        );
                    }
                    await next();
                },
                async () => {
                    originHits += 1;
                    return Response.json({ originHits });
                },
            );
        const env = createTextCacheEnv();
        const cachedBody = {
            model: "openai-fast",
            messages: [{ role: "user", content: "cached public hit" }],
        };

        const warm = await dispatch(
            app,
            "/v1/chat/completions",
            {
                ...chatInit(cachedBody),
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test-key",
                },
            },
            env,
        );
        await consumeAndWait(warm);
        expect(warm.response.headers.get("X-Cache")).toBe("MISS");

        const cachedNoAuth = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit(cachedBody),
            env,
        );
        await consumeAndWait(cachedNoAuth);
        expect(cachedNoAuth.response.status).toBe(200);
        expect(cachedNoAuth.response.headers.get("X-Cache")).toBe("HIT");
        expect(originHits).toBe(1);

        const missNoAuth = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [{ role: "user", content: "uncached miss" }],
            }),
            env,
        );
        await consumeAndWait(missNoAuth);
        expect(missNoAuth.response.status).toBe(401);
        expect(originHits).toBe(1);
    });

    it("caches chat completions after JSON validation consumed the body", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "cache me" }],
        });

        const firstCtx = createExecutionContext();
        const first = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            }),
            env,
            firstCtx,
        );
        expect(await first.json()).toMatchObject({ originHits: 1 });
        await waitOnExecutionContext(firstCtx);

        const secondCtx = createExecutionContext();
        const second = await app.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            }),
            env,
            secondCtx,
        );
        await waitOnExecutionContext(secondCtx);

        expect(second.headers.get("X-Cache")).toBe("HIT");
        expect(second.headers.get("Cache-Control")).toBe(
            IMMUTABLE_CACHE_CONTROL,
        );
        expect(second.headers.get("Content-Type")).toBe(
            "application/json; charset=utf-8",
        );
        expect(second.headers.get("x-model-used")).toBe("openai-fast");
        expect(second.headers.get("x-usage-prompt-text-tokens")).toBe("12");
        expect(second.headers.get("x-moderation-hate-severity")).toBe("safe");
        expect(await second.json()).toMatchObject({ originHits: 1 });
        expect(cache.originHits).toBe(1);
    });

    it("treats different POST bodies as different cache entries", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();

        const first = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [{ role: "user", content: "message a" }],
            }),
            env,
        );
        await consumeAndWait(first);
        expect(first.response.headers.get("X-Cache")).toBe("MISS");

        const second = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [{ role: "user", content: "message b" }],
            }),
            env,
        );
        await consumeAndWait(second);

        expect(second.response.headers.get("X-Cache")).toBe("MISS");
        expect(cache.originHits).toBe(2);
    });

    it("caches simple GET text requests", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();

        const first = await dispatch(
            app,
            "/text/cache-test-prompt?model=openai-fast",
            undefined,
            env,
        );
        await consumeAndWait(first);
        expect(first.response.headers.get("X-Cache")).toBe("MISS");

        const second = await dispatch(
            app,
            "/text/cache-test-prompt?model=openai-fast",
            undefined,
            env,
        );
        const body = await consumeAndWait(second);

        expect(second.response.headers.get("X-Cache")).toBe("HIT");
        expect(body).toBe("hit:1:cache-test-prompt");
        expect(cache.originHits).toBe(1);
    });

    it("normalizes GET query parameter order for cache keys", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();

        const first = await dispatch(
            app,
            "/text/cache-test-prompt?model=openai-fast&referrer=test",
            undefined,
            env,
        );
        await consumeAndWait(first);
        expect(first.response.headers.get("X-Cache")).toBe("MISS");

        const second = await dispatch(
            app,
            "/text/cache-test-prompt?referrer=test&model=openai-fast",
            undefined,
            env,
        );
        const body = await consumeAndWait(second);

        expect(second.response.headers.get("X-Cache")).toBe("HIT");
        expect(body).toBe("hit:1:cache-test-prompt");
        expect(cache.originHits).toBe(1);
    });

    it("uses different cache keys for streaming and non-streaming chat bodies", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();
        const message = { role: "user", content: "stream split" };

        const nonStreamingFirst = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [message],
                stream: false,
            }),
            env,
        );
        await consumeAndWait(nonStreamingFirst);

        const nonStreamingSecond = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [message],
                stream: false,
            }),
            env,
        );
        await consumeAndWait(nonStreamingSecond);

        const streamingFirst = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [message],
                stream: true,
            }),
            env,
        );
        await consumeAndWait(streamingFirst);

        const streamingSecond = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [message],
                stream: true,
            }),
            env,
        );
        await consumeAndWait(streamingSecond);

        expect(nonStreamingSecond.response.headers.get("X-Cache")).toBe("HIT");
        expect(streamingSecond.response.headers.get("X-Cache")).toBe("HIT");
        expect(nonStreamingSecond.response.headers.get("X-Cache-Key")).not.toBe(
            streamingSecond.response.headers.get("X-Cache-Key"),
        );
        expect(cache.originHits).toBe(2);
    });

    it("bypasses cache for seed -1 in POST bodies and GET query params", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const env = createTextCacheEnv();

        const firstPost = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [{ role: "user", content: "random post" }],
                seed: -1,
            }),
            env,
        );
        await consumeAndWait(firstPost);

        const secondPost = await dispatch(
            app,
            "/v1/chat/completions",
            chatInit({
                model: "openai-fast",
                messages: [{ role: "user", content: "random post" }],
                seed: -1,
            }),
            env,
        );
        await consumeAndWait(secondPost);

        const firstGet = await dispatch(
            app,
            "/text/random?model=openai-fast&seed=-1",
            undefined,
            env,
        );
        await consumeAndWait(firstGet);

        const secondGet = await dispatch(
            app,
            "/text/random?model=openai-fast&seed=-1",
            undefined,
            env,
        );
        await consumeAndWait(secondGet);

        expect(firstPost.response.headers.get("X-Cache")).toBeNull();
        expect(secondPost.response.headers.get("X-Cache")).toBeNull();
        expect(firstGet.response.headers.get("X-Cache")).toBeNull();
        expect(secondGet.response.headers.get("X-Cache")).toBeNull();
        expect(cache.originHits).toBe(4);
    });

    it("does not add text cache headers to routes without cache middleware", async () => {
        const { app } = createTextCacheApp();
        const response = await dispatch(app, "/v1/models");

        await consumeAndWait(response);
        expect(response.response.headers.get("X-Cache")).toBeNull();
    });
});
