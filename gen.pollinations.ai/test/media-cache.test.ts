import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { audioCache, imageCache } from "@/middleware/media-cache.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

type TestEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

type MediaCache = typeof imageCache;

function createMediaCacheApp(cache: MediaCache, contentType: string) {
    let originHits = 0;
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            await next();
        })
        .get(
            "/media/:prompt",
            cache,
            async (c, next) => {
                if (c.req.header("authorization") !== "Bearer test-key") {
                    return new Response("Authentication required", {
                        status: 401,
                    });
                }
                await next();
            },
            async () => {
                originHits += 1;
                return new Response(`origin:${originHits}`, {
                    headers: { "Content-Type": contentType },
                });
            },
        );

    return {
        app,
        get originHits() {
            return originHits;
        },
    };
}

function createMediaCacheEnv(
    bucket = createTestR2Bucket(),
): CloudflareBindings {
    return {
        IMAGE_BUCKET: bucket,
    } as unknown as CloudflareBindings;
}

async function dispatch(
    app: Hono<TestEnv>,
    path: string,
    init?: RequestInit,
    env = createMediaCacheEnv(),
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

describe("media cache", () => {
    it.each([
        { label: "image", cache: imageCache, contentType: "image/png" },
        {
            label: "SVG",
            cache: imageCache,
            contentType: "image/svg+xml",
        },
        { label: "audio", cache: audioCache, contentType: "audio/mpeg" },
    ])("serves cached $label responses before auth while misses still require auth", async ({
        cache,
        contentType,
    }) => {
        const media = createMediaCacheApp(cache, contentType);
        const env = createMediaCacheEnv();

        const warm = await dispatch(
            media.app,
            "/media/cached-hit",
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(warm)).toBe("origin:1");

        const cachedNoAuth = await dispatch(
            media.app,
            "/media/cached-hit",
            undefined,
            env,
        );
        expect(await consumeAndWait(cachedNoAuth)).toBe("origin:1");
        expect(cachedNoAuth.response.status).toBe(200);
        expect(cachedNoAuth.response.headers.get("X-Cache")).toBe("HIT");
        expect(cachedNoAuth.response.headers.get("Cache-Control")).toBe(
            IMMUTABLE_CACHE_CONTROL,
        );
        expect(media.originHits).toBe(1);

        const missNoAuth = await dispatch(
            media.app,
            "/media/uncached-miss",
            undefined,
            env,
        );
        expect(await consumeAndWait(missNoAuth)).toBe(
            "Authentication required",
        );
        expect(missNoAuth.response.status).toBe(401);
        expect(media.originHits).toBe(1);
    });

    it("preserves SVG content and browser safety headers on cache hits", async () => {
        const svgHeaders = {
            "Content-Type": "image/svg+xml",
            "Content-Disposition": 'inline; filename="vector.svg"',
            "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "X-Content-Type-Options": "nosniff",
        };
        let originHits = 0;
        const app = new Hono<TestEnv>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "test-request");
                await next();
            })
            .get("/media/:prompt", imageCache, async () => {
                originHits += 1;
                return new Response("<svg/>", { headers: svgHeaders });
            });
        const env = createMediaCacheEnv();

        const miss = await dispatch(app, "/media/vector", undefined, env);
        expect(await consumeAndWait(miss)).toBe("<svg/>");

        const hit = await dispatch(app, "/media/vector", undefined, env);
        expect(await consumeAndWait(hit)).toBe("<svg/>");
        expect(hit.response.headers.get("X-Cache")).toBe("HIT");
        expect(hit.response.headers.get("Content-Type")).toBe("image/svg+xml");
        expect(hit.response.headers.get("Content-Disposition")).toBe(
            svgHeaders["Content-Disposition"],
        );
        expect(hit.response.headers.get("Content-Security-Policy")).toBe(
            svgHeaders["Content-Security-Policy"],
        );
        expect(hit.response.headers.get("X-Content-Type-Options")).toBe(
            "nosniff",
        );
        expect(originHits).toBe(1);
    });

    it("refreshes cached media TTL on aged cache hits", async () => {
        const media = createMediaCacheApp(imageCache, "image/png");
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);
        const path = "/media/ttl-refresh";

        const warm = await dispatch(
            media.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(warm)).toBe("origin:1");
        expect(bucket.putCount).toBe(1);

        const cached = await dispatch(media.app, path, undefined, env);
        expect(await consumeAndWait(cached)).toBe("origin:1");
        expect(cached.response.headers.get("X-Cache")).toBe("HIT");
        expect(media.originHits).toBe(1);
        expect(bucket.putCount).toBe(2);
    });
});

/** Streams its body instead of buffering it, the way the audio routes do. */
function createStreamingMediaApp(cache: MediaCache, contentType: string) {
    const app = new Hono<TestEnv>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            await next();
        })
        .get("/media/:prompt", cache, async () => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("streamed"));
                    controller.close();
                },
            });
            return new Response(stream, {
                headers: { "Content-Type": contentType },
            });
        });
    return app;
}

describe("media cache write independence", () => {
    it.each([
        { label: "audio", cache: audioCache, contentType: "audio/mpeg" },
        { label: "image", cache: imageCache, contentType: "image/png" },
    ])("caches a streamed $label response even when the client never reads the body", async ({
        cache,
        contentType,
    }) => {
        const app = createStreamingMediaApp(cache, contentType);
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);

        // Deliberately do NOT read response.body. Under `clone()` the cache
        // branch is only drained as fast as the client drains its own, so a
        // caller that walks away could stall the write entirely.
        const miss = await dispatch(app, "/media/streamed", undefined, env);
        await miss.wait();

        expect(bucket.putCount).toBe(1);
        const stored = bucket.getObject(
            generateCacheKey(
                new URL("https://gen.pollinations.ai/media/streamed"),
            ),
        );
        expect(new TextDecoder().decode(stored?.body)).toBe("streamed");

        // The client's half is still intact and independently readable.
        expect(await miss.response.text()).toBe("streamed");
    });

    it("serves the stored copy of a streamed response on the next request", async () => {
        const app = createStreamingMediaApp(audioCache, "audio/mpeg");
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);

        const miss = await dispatch(app, "/media/replayed", undefined, env);
        await miss.wait();

        const hit = await dispatch(app, "/media/replayed", undefined, env);
        expect(await consumeAndWait(hit)).toBe("streamed");
        expect(hit.response.headers.get("X-Cache")).toBe("HIT");
    });
});
