import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { audioCache, imageCache } from "@/middleware/media-cache.ts";

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
    uploaded: Date;
};

function createMediaBucket(): R2Bucket {
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
            const httpMetadata =
                options?.httpMetadata instanceof Headers
                    ? undefined
                    : options?.httpMetadata;
            objects.set(key, {
                body,
                httpMetadata,
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

function createMediaCacheEnv(): CloudflareBindings {
    return {
        IMAGE_BUCKET: createMediaBucket(),
    } as CloudflareBindings;
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
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

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

    it("queues save/catalog writes without changing cache identity", async () => {
        const catalogFetch = vi.fn<
            (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >(async () => Response.json({ ok: true }));
        vi.stubGlobal("fetch", catalogFetch);

        const media = createMediaCacheApp(imageCache, "image/png");
        const env = createMediaCacheEnv();
        const saved = await dispatch(
            media.app,
            "/media/generated?save=1&visibility=public&tag=catgpt&tags=parent:abc123&model=flux&key=test-key",
            {
                headers: { Authorization: "Bearer test-key" },
            },
            env,
        );

        expect(await consumeAndWait(saved)).toBe("origin:1");
        expect(catalogFetch).toHaveBeenCalledOnce();
        const [catalogUrl, catalogRequest] = catalogFetch.mock.calls[0];
        expect(catalogUrl).toBe("https://media.pollinations.ai/catalog");

        if (!catalogRequest) throw new Error("Missing catalog request init");
        const catalogBody = JSON.parse(catalogRequest.body as string);
        expect(catalogRequest.headers).toMatchObject({
            Authorization: "Bearer test-key",
        });
        expect(catalogBody).toMatchObject({
            url: "https://gen.pollinations.ai/media/generated?model=flux",
            visibility: "public",
            tags: ["catgpt", "parent:abc123"],
            contentType: "image/png",
            model: "flux",
        });

        const cachedWithoutCatalogParams = await dispatch(
            media.app,
            "/media/generated?model=flux",
            undefined,
            env,
        );
        expect(await consumeAndWait(cachedWithoutCatalogParams)).toBe(
            "origin:1",
        );
        expect(cachedWithoutCatalogParams.response.headers.get("X-Cache")).toBe(
            "HIT",
        );
        expect(media.originHits).toBe(1);
    });
});
