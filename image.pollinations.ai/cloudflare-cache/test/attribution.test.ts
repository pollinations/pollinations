import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
    ATTRIBUTION_HEADERS,
    addAttributionHeaders,
} from "../src/attribution.ts";
import { CACHE_VERSION, generateCacheKey } from "../src/cache-utils.ts";
import { exactCache } from "../src/middleware/exact-cache.ts";

describe("endpoint branding", () => {
    it("adds the Pollinations link and logo headers", () => {
        const headers = new Headers();

        addAttributionHeaders(headers);

        for (const [name, value] of Object.entries(ATTRIBUTION_HEADERS)) {
            expect(headers.get(name)).toBe(value);
        }
    });

    it("versions exact cache keys so old unbranded images are bypassed", () => {
        const first = generateCacheKey(
            new URL(
                "https://image.pollinations.ai/prompt/flower?width=512&height=512",
            ),
        );
        const reordered = generateCacheKey(
            new URL(
                "https://image.pollinations.ai/prompt/flower?height=512&width=512",
            ),
        );

        expect(first).toBe(reordered);
        expect(first.startsWith(`${CACHE_VERSION}-`)).toBe(true);
    });
});

describe("exact cache", () => {
    const generatingApp = () => {
        let generated = 0;
        const app = new Hono<{ Bindings: Cloudflare.Env }>();
        app.all("/prompt/:prompt", exactCache, (c) => {
            generated++;
            return c.body(c.req.method === "HEAD" ? null : "jpeg", 200, {
                "content-type": "image/jpeg",
            });
        });
        return { app, generated: () => generated };
    };

    it("regenerates instead of serving an empty cached image", async () => {
        const url = "https://image.pollinations.ai/prompt/empty-hit";
        const key = generateCacheKey(new URL(url));
        await env.IMAGE_BUCKET.put(key, new ArrayBuffer(0));
        const { app, generated } = generatingApp();
        const ctx = createExecutionContext();

        const response = await app.request(url, {}, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.headers.get("x-cache")).toBe("MISS");
        expect(await response.text()).toBe("jpeg");
        expect(generated()).toBe(1);
        expect((await env.IMAGE_BUCKET.head(key))?.size).toBe(4);
    });

    it("stores only the cache time and method with an image", async () => {
        const url =
            "https://image.pollinations.ai/prompt/private-prompt?token=x";
        const { app } = generatingApp();
        const ctx = createExecutionContext();

        await app.request(url, {}, env, ctx);
        await waitOnExecutionContext(ctx);

        const stored = await env.IMAGE_BUCKET.head(
            generateCacheKey(new URL(url)),
        );
        expect(Object.keys(stored?.customMetadata ?? {}).sort()).toEqual([
            "cachedAt",
            "method",
        ]);
    });

    it("does not store a HEAD response", async () => {
        const url = "https://image.pollinations.ai/prompt/head-miss";
        const { app } = generatingApp();
        const ctx = createExecutionContext();

        await app.request(url, { method: "HEAD" }, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(
            await env.IMAGE_BUCKET.head(generateCacheKey(new URL(url))),
        ).toBeNull();
    });
});
