// Temporary: delete with src/middleware/legacy-media-cache.ts.
import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import {
    type GenerationCacheEnv,
    hashGenerationCacheIdentity,
    prepareGenerationRequest,
} from "../src/middleware/generation-cache.ts";
import { legacyMediaCacheKey } from "../src/middleware/legacy-media-cache.ts";
import {
    audioCache,
    imageCache,
    model3dCache,
} from "../src/middleware/media-cache.ts";
import { generateCacheKey } from "../src/utils/media-cache.ts";

const log = {
    getChild: () => log,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

const generate = () =>
    new Response("generation requires auth", { status: 401 });
const app = new Hono<GenerationCacheEnv>()
    .use("*", async (c, next) => {
        c.set("log", log);
        c.set("requestId", "migration-test");
        // Image generations already supply this URL before the cache adapter runs.
        if (c.req.path === "/v1/images/generations") {
            c.set(
                "generationCacheUrl",
                new URL(
                    "https://gen.pollinations.ai/image/wrapped?model=flux&seed=42",
                ),
            );
        }
        await next();
    })
    .get("/image/:prompt", imageCache, generate)
    .get("/video/:prompt", imageCache, generate)
    .get("/audio/:prompt", audioCache, generate)
    .get("/3d/:prompt", model3dCache, generate)
    .post("/v1/audio/speech", prepareGenerationRequest, audioCache, generate)
    .post("/v1/images/generations", imageCache, generate);

async function request(path: string, init?: RequestInit) {
    const ctx = createExecutionContext();
    const response = await app.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    const body = await response.text();
    await waitOnExecutionContext(ctx);
    return { response, body };
}

afterEach(() => vi.restoreAllMocks());

describe("temporary legacy media cache", () => {
    fixtureTest(
        "serves a migrated hit through the real worker without spending",
        async ({ budgetedApiKey }) => {
            const url = new URL(
                "https://gen.pollinations.ai/image/migration-worker?model=zimage&seed=42",
            );
            await env.LEGACY_MEDIA_BUCKET.put(
                legacyMediaCacheKey(url),
                "image bytes",
                {
                    httpMetadata: { contentType: "image/png" },
                },
            );
            const balance = () =>
                env.DB.prepare(
                    "SELECT tier_balance, pack_balance FROM user WHERE id = ?",
                )
                    .bind(budgetedApiKey.userId)
                    .first();
            const before = await balance();
            const upstream = vi
                .spyOn(globalThis, "fetch")
                .mockRejectedValue(new Error("No upstream calls expected"));
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(url, {
                    headers: { Authorization: `Bearer ${budgetedApiKey.key}` },
                }),
                env,
                ctx,
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("x-cache")).toBe("HIT");
            expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
                "image bytes",
            );
            await waitOnExecutionContext(ctx);
            expect(await balance()).toEqual(before);
            // Neither provider generation nor a billed Tinybird event is sent.
            expect(upstream).not.toHaveBeenCalled();
        },
    );

    it("matches frozen pre-migration keys, not just the new hash algorithm", () => {
        expect(
            legacyMediaCacheKey(
                new URL(
                    "https://gen.pollinations.ai/image/a%20cat?seed=42&model=flux&key=secret",
                ),
            ),
        ).toBe("_image_a%20cat_model_flux_seed_42-28c14271");
        expect(
            legacyMediaCacheKey(
                new URL("https://gen.pollinations.ai/audio/hi?voice=nova"),
                "true",
            ),
        ).toBe(
            "_audio_hi_voice_nova___safe_header_true___safety_bedrock-input-v1-3412a431",
        );
        const long = legacyMediaCacheKey(
            new URL(
                `https://gen.pollinations.ai/image/${"x".repeat(1200)}?model=flux`,
            ),
        );
        expect(long).toHaveLength(999);
        expect(long.endsWith("-47f5bd67")).toBe(true);
        const url = new URL(
            "https://gen.pollinations.ai/image/🐝?seed=42&model=flux&KEY=secret&NoFeed=true&no-cache=true",
        );
        expect(legacyMediaCacheKey(url)).toBe(
            legacyMediaCacheKey(
                new URL(
                    "https://gen.pollinations.ai/image/🐝?model=flux&seed=42",
                ),
            ),
        );
        expect(legacyMediaCacheKey(url, "true")).not.toBe(
            legacyMediaCacheKey(url),
        );
        expect(legacyMediaCacheKey(url, "false", ["sexual"])).not.toBe(
            legacyMediaCacheKey(url, "false"),
        );
    });

    it.each([
        ["image", "image/svg+xml"],
        ["video", "video/mp4"],
        ["audio", "audio/mpeg"],
        ["3d", "model/gltf-binary"],
    ])("promotes old %s bytes and metadata without generation or changing the old object", async (route, contentType) => {
        const path = `/${route}/legacy?seed=42`;
        const url = new URL(`https://gen.pollinations.ai${path}`);
        const legacyKey = legacyMediaCacheKey(url);
        await env.LEGACY_MEDIA_BUCKET.put(legacyKey, "original bytes", {
            httpMetadata: { contentType },
            customMetadata: {
                header_x_model: "not a public header",
                "header_x-model-used": "original-model",
                "header_x-usage-completion-audio-tokens": "10",
                "header_x-safety-applied": "privacy",
                "header_content-security-policy": "default-src 'none'; sandbox",
                "header_set-cookie": "must-not-be-replayed",
            },
        });
        const original = await env.LEGACY_MEDIA_BUCKET.head(legacyKey);
        const first = await request(path);
        expect(first.response.status).toBe(200);
        expect(first.body).toBe("original bytes");
        expect(first.response.headers.get("x-cache")).toBe("HIT");
        expect(first.response.headers.get("x-model-used")).toBe(
            "original-model",
        );
        expect(first.response.headers.get("content-security-policy")).toBe(
            "default-src 'none'; sandbox",
        );
        expect(first.response.headers.get("x-safety-applied")).toBe("privacy");
        expect(first.response.headers.get("set-cookie")).toBeNull();
        const key = await generateCacheKey(url);
        expect(first.response.headers.get("x-media-url")).toBe(
            `https://media.pollinations.ai/${key}`,
        );
        const stored = await env.MEDIA.get(key);
        expect(await stored?.text()).toBe("original bytes");
        expect(stored?.headers.get("content-type")).toBe(contentType);
        expect(await env.LEGACY_MEDIA_BUCKET.head(legacyKey)).toMatchObject({
            etag: original?.etag,
            uploaded: original?.uploaded,
        });
        const oldRead = vi
            .spyOn(env.LEGACY_MEDIA_BUCKET, "get")
            .mockRejectedValue(new Error("must not read old cache again"));
        expect((await request(path)).body).toBe("original bytes");
        expect(oldRead).not.toHaveBeenCalled();
    });

    it("prefers an existing Media result without reading the old bucket", async () => {
        const path = "/image/new-wins";
        const key = await generateCacheKey(
            new URL(`https://gen.pollinations.ai${path}`),
        );
        await env.MEDIA.put(
            key,
            new Response("current", {
                headers: { "Content-Type": "image/png" },
            }),
        );
        const oldRead = vi
            .spyOn(env.LEGACY_MEDIA_BUCKET, "get")
            .mockRejectedValue(new Error("old cache unavailable"));
        expect((await request(path)).body).toBe("current");
        expect(oldRead).not.toHaveBeenCalled();
    });

    it("uses the existing image-generation cache URL", async () => {
        const url = new URL(
            "https://gen.pollinations.ai/image/wrapped?model=flux&seed=42",
        );
        await env.LEGACY_MEDIA_BUCKET.put(
            legacyMediaCacheKey(url),
            "image bytes",
            { httpMetadata: { contentType: "image/png" } },
        );
        const result = await request("/v1/images/generations", {
            method: "POST",
        });
        expect(result.response.status).toBe(200);
        expect(result.body).toBe("image bytes");
        expect(result.response.headers.get("x-media-url")).toBe(
            `https://media.pollinations.ai/${await generateCacheKey(url)}`,
        );
    });

    it("includes normalized POST bodies in the old key", async () => {
        const body = '{"input":"hello","model":"elevenlabs"}';
        const url = new URL("https://gen.pollinations.ai/v1/audio/speech");
        url.searchParams.set(
            "__request_body",
            await hashGenerationCacheIdentity("media", body),
        );
        await env.LEGACY_MEDIA_BUCKET.put(
            legacyMediaCacheKey(url),
            "audio bytes",
            { httpMetadata: { contentType: "audio/mpeg" } },
        );
        const result = await request("/v1/audio/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"model":"elevenlabs","input":"hello","key":"ignored"}',
        });
        expect(result.response.status).toBe(200);
        expect(result.body).toBe("audio bytes");
        expect(
            (
                await request("/v1/audio/speech", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"model":"elevenlabs","input":"different"}',
                })
            ).response.status,
        ).toBe(401);
    });

    it.each([
        "missing",
        "empty",
        "wrong-type",
    ])("continues normally for a %s old object", async (kind) => {
        const path = `/image/${kind}`;
        const url = new URL(`https://gen.pollinations.ai${path}`);
        if (kind !== "missing") {
            await env.LEGACY_MEDIA_BUCKET.put(
                legacyMediaCacheKey(url),
                kind === "empty" ? "" : "text",
                {
                    httpMetadata: {
                        contentType:
                            kind === "wrong-type" ? "text/plain" : "image/png",
                    },
                },
            );
        }
        expect((await request(path)).response.status).toBe(401);
        expect(await env.MEDIA.has(await generateCacheKey(url))).toBe(false);
    });

    it("returns a cache error instead of generating when the old lookup fails", async () => {
        vi.spyOn(env.LEGACY_MEDIA_BUCKET, "get").mockRejectedValue(
            new Error("old bucket unavailable"),
        );
        expect((await request("/image/lookup-error")).response.status).toBe(
            503,
        );
    });

    it("does not treat a failed promotion as a cache hit", async () => {
        const url = new URL("https://gen.pollinations.ai/image/write-error");
        await env.LEGACY_MEDIA_BUCKET.put(legacyMediaCacheKey(url), "image", {
            httpMetadata: { contentType: "image/png" },
        });
        vi.spyOn(env.MEDIA, "put").mockImplementation(
            async (_key, response) => {
                // Like the real RPC, consume the upload before an R2 write fails.
                await response.arrayBuffer();
                throw new Error("Media write failed");
            },
        );
        expect((await request(url.pathname)).response.status).toBe(503);
        expect(await env.MEDIA.has(await generateCacheKey(url))).toBe(false);
        expect(
            await env.LEGACY_MEDIA_BUCKET.head(legacyMediaCacheKey(url)),
        ).not.toBeNull();
    });
});
