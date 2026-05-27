import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
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

type CachedObject = {
    body: Uint8Array;
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
    storageClass?: R2Object["storageClass"];
    uploaded: Date;
};

type TestMediaBucket = R2Bucket & {
    getObject(key: string): CachedObject | undefined;
    readonly putCount: number;
};

function createMediaBucket(): TestMediaBucket {
    const objects = new Map<string, CachedObject>();
    let putCount = 0;
    let uploadTime = 0;

    return {
        get: async (key: string) => {
            const object = objects.get(key);
            if (!object) return null;
            return {
                ...object,
                body: new Response(object.body.slice()).body,
            };
        },
        put: async (key: string, value: BodyInit, options?: R2PutOptions) => {
            putCount += 1;
            const body = new Uint8Array(
                await new Response(value).arrayBuffer(),
            );
            const httpMetadata =
                options?.httpMetadata instanceof Headers
                    ? undefined
                    : options?.httpMetadata;
            uploadTime += 1;
            objects.set(key, {
                body,
                httpMetadata,
                customMetadata: options?.customMetadata,
                storageClass: options?.storageClass,
                uploaded: new Date(uploadTime),
            });
            return null;
        },
        getObject: (key: string) => objects.get(key),
        get putCount() {
            return putCount;
        },
    } as unknown as TestMediaBucket;
}

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

function createMediaCacheEnv(bucket = createMediaBucket()): CloudflareBindings {
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

    it("refreshes cached media TTL on cache hits", async () => {
        const media = createMediaCacheApp(imageCache, "image/png");
        const bucket = createMediaBucket();
        const env = createMediaCacheEnv(bucket);
        const path = "/media/ttl-refresh";
        const cacheKey = generateCacheKey(
            new URL(`https://gen.pollinations.ai${path}`),
        );

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

        const firstCachedObject = bucket.getObject(cacheKey);
        expect(firstCachedObject?.uploaded.getTime()).toBe(1);

        const cached = await dispatch(media.app, path, undefined, env);
        expect(await consumeAndWait(cached)).toBe("origin:1");
        expect(cached.response.headers.get("X-Cache")).toBe("HIT");
        expect(media.originHits).toBe(1);
        expect(bucket.putCount).toBe(2);

        const refreshedObject = bucket.getObject(cacheKey);
        expect(refreshedObject?.uploaded.getTime()).toBe(2);
        expect(refreshedObject?.httpMetadata?.contentType).toBe("image/png");
        expect(new TextDecoder().decode(refreshedObject?.body)).toBe(
            "origin:1",
        );
    });
});
