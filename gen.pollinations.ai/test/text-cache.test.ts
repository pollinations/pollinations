import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { validator } from "@shared/middleware/validator.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { textCache } from "@/middleware/text-cache.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables & Partial<AuthVariables>;
};

function createAuthState(opts: {
    cacheWritesDisabled?: boolean;
    privacyModeEnabled?: boolean;
}): AuthVariables["auth"] {
    const user = {
        id: "user-cache-pref",
        cacheWritesDisabled: opts.cacheWritesDisabled === true,
        privacyModeEnabled: opts.privacyModeEnabled === true,
    } as NonNullable<AuthVariables["auth"]["user"]>;
    return {
        user,
        requireAuthorization: async () => {},
        requireUser: () => user,
        requireModelAccess: () => {},
    };
}

function createTextCacheApp(
    opts: { cacheWritesDisabled?: boolean; privacyModeEnabled?: boolean } = {},
) {
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            if (
                typeof opts.cacheWritesDisabled === "boolean" ||
                typeof opts.privacyModeEnabled === "boolean"
            ) {
                c.set("auth", createAuthState(opts));
            }
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

function createTextCacheEnv(bucket = createTestR2Bucket()): CloudflareBindings {
    return {
        TEXT_BUCKET: bucket,
    } as unknown as CloudflareBindings;
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

    it("refreshes cached text TTL on aged cache hits", async () => {
        const cache = createTextCacheApp();
        const { app } = cache;
        const bucket = createTestR2Bucket();
        const env = createTextCacheEnv(bucket);
        const path = "/text/ttl-refresh?model=openai-fast";

        const first = await dispatch(app, path, undefined, env);
        await consumeAndWait(first);
        expect(first.response.headers.get("X-Cache")).toBe("MISS");
        expect(bucket.putCount).toBe(1);

        const second = await dispatch(app, path, undefined, env);
        const body = await consumeAndWait(second);

        expect(second.response.headers.get("X-Cache")).toBe("HIT");
        expect(body).toBe("hit:1:ttl-refresh");
        expect(cache.originHits).toBe(1);
        expect(bucket.putCount).toBe(2);
    });

    it("skips text cache writes for users with cache writes disabled", async () => {
        const cache = createTextCacheApp({ cacheWritesDisabled: true });
        const { app } = cache;
        const bucket = createTestR2Bucket();
        const env = createTextCacheEnv(bucket);
        const path = "/text/no-write?model=openai-fast";

        const first = await dispatch(app, path, undefined, env);
        expect(await consumeAndWait(first)).toBe("hit:1:no-write");
        expect(first.response.headers.get("X-Cache")).toBe("MISS");
        expect(first.response.headers.get("X-Cache-Write")).toBe("SKIP");
        expect(bucket.putCount).toBe(0);

        const second = await dispatch(app, path, undefined, env);
        expect(await consumeAndWait(second)).toBe("hit:2:no-write");
        expect(second.response.headers.get("X-Cache")).toBe("MISS");
        expect(second.response.headers.get("X-Cache-Write")).toBe("SKIP");
        expect(cache.originHits).toBe(2);
        expect(bucket.putCount).toBe(0);
    });

    it("serves text cache hits without TTL refresh when cache writes are disabled", async () => {
        const writer = createTextCacheApp();
        const bucket = createTestR2Bucket();
        const env = createTextCacheEnv(bucket);
        const path = "/text/read-existing?model=openai-fast";

        const warm = await dispatch(writer.app, path, undefined, env);
        expect(await consumeAndWait(warm)).toBe("hit:1:read-existing");
        expect(bucket.putCount).toBe(1);

        const reader = createTextCacheApp({ cacheWritesDisabled: true });
        const cached = await dispatch(reader.app, path, undefined, env);
        expect(await consumeAndWait(cached)).toBe("hit:1:read-existing");
        expect(cached.response.headers.get("X-Cache")).toBe("HIT");
        expect(reader.originHits).toBe(0);
        expect(bucket.putCount).toBe(1);
    });

    it("does not serve non-privacy text cache entries to privacy-mode users", async () => {
        const writer = createTextCacheApp();
        const bucket = createTestR2Bucket();
        const env = createTextCacheEnv(bucket);
        const path = "/text/privacy-namespace?model=openai-fast";

        const warm = await dispatch(writer.app, path, undefined, env);
        expect(await consumeAndWait(warm)).toBe("hit:1:privacy-namespace");
        expect(bucket.putCount).toBe(1);

        const reader = createTextCacheApp({ privacyModeEnabled: true });
        const privacyModeResponse = await dispatch(
            reader.app,
            path,
            undefined,
            env,
        );
        expect(await consumeAndWait(privacyModeResponse)).toBe(
            "hit:1:privacy-namespace",
        );
        expect(privacyModeResponse.response.headers.get("X-Cache")).toBe(
            "MISS",
        );
        expect(reader.originHits).toBe(1);
        expect(bucket.putCount).toBe(2);
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
