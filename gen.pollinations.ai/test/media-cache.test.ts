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
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { audioCache, imageCache } from "@/middleware/media-cache.ts";

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

type MediaCache = typeof imageCache;

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

function createMediaCacheApp(
    cache: MediaCache,
    contentType: string,
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

    it("skips media cache writes for users with cache writes disabled", async () => {
        const media = createMediaCacheApp(imageCache, "image/png", {
            cacheWritesDisabled: true,
        });
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);
        const path = "/media/no-write";

        const first = await dispatch(
            media.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(first)).toBe("origin:1");
        expect(first.response.headers.get("X-Cache-Write")).toBe("SKIP");
        expect(bucket.putCount).toBe(0);

        const second = await dispatch(
            media.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(second)).toBe("origin:2");
        expect(second.response.headers.get("X-Cache-Write")).toBe("SKIP");
        expect(media.originHits).toBe(2);
        expect(bucket.putCount).toBe(0);
    });

    it("serves media cache hits without TTL refresh when cache writes are disabled", async () => {
        const writer = createMediaCacheApp(imageCache, "image/png");
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);
        const path = "/media/read-existing";

        const warm = await dispatch(
            writer.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(warm)).toBe("origin:1");
        expect(bucket.putCount).toBe(1);

        const reader = createMediaCacheApp(imageCache, "image/png", {
            cacheWritesDisabled: true,
        });
        const cached = await dispatch(reader.app, path, undefined, env);
        expect(await consumeAndWait(cached)).toBe("origin:1");
        expect(cached.response.headers.get("X-Cache")).toBe("HIT");
        expect(reader.originHits).toBe(0);
        expect(bucket.putCount).toBe(1);
    });

    it("does not serve non-privacy media cache entries to privacy-mode users", async () => {
        const writer = createMediaCacheApp(imageCache, "image/png");
        const bucket = createTestR2Bucket();
        const env = createMediaCacheEnv(bucket);
        const path = "/media/privacy-namespace";

        const warm = await dispatch(
            writer.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(warm)).toBe("origin:1");
        expect(bucket.putCount).toBe(1);

        const reader = createMediaCacheApp(imageCache, "image/png", {
            privacyModeEnabled: true,
        });
        const privacyModeResponse = await dispatch(
            reader.app,
            path,
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );
        expect(await consumeAndWait(privacyModeResponse)).toBe("origin:1");
        expect(reader.originHits).toBe(1);
        expect(bucket.putCount).toBe(2);
    });
});
