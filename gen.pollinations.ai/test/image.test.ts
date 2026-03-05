import { env, SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { generateCacheKey } from "../src/utils/image-cache.ts";

// Minimal 1x1 PNG for cache tests
const TINY_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function populateCache(path: string): Promise<void> {
    const testUrl = new URL(`http://localhost/api/generate${path}`);
    const cacheKey = generateCacheKey(testUrl);
    await env.IMAGE_BUCKET.put(cacheKey, TINY_PNG.buffer, {
        httpMetadata: { contentType: "image/png" },
    });
}

describe("Image Integration Tests", () => {
    test("cached image returns X-Cache: HIT from R2", async () => {
        await populateCache(
            "/image/test-cached?model=flux&width=256&height=256&seed=42",
        );

        const response = await SELF.fetch(
            "http://localhost/api/generate/image/test-cached?model=flux&width=256&height=256&seed=42",
            { method: "GET" },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expect(response.headers.get("X-Cache-Type")).toBe("EXACT");

        const body = await response.arrayBuffer();
        expect(body.byteLength).toBe(TINY_PNG.byteLength);
    });

    test("cache hit works without authentication (cache-first pattern)", async () => {
        await populateCache(
            "/image/test-no-auth-cache?model=flux&width=256&height=256&seed=99",
        );

        // Request WITHOUT auth should still get cache HIT
        // This proves cache runs BEFORE auth middleware
        const response = await SELF.fetch(
            "http://localhost/api/generate/image/test-no-auth-cache?model=flux&width=256&height=256&seed=99",
            { method: "GET" },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");

        await response.arrayBuffer();
    });

    test("uncached image request requires authentication", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/image/test-needs-auth?model=flux",
            { method: "GET" },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test("seed=-1 bypasses cache", async () => {
        await populateCache(
            "/image/test-seed-bypass?model=flux&width=256&height=256&seed=-1",
        );

        // Request with seed=-1 should bypass cache entirely
        // Since there's no auth, it should return 401 (proving cache was skipped)
        const response = await SELF.fetch(
            "http://localhost/api/generate/image/test-seed-bypass?model=flux&width=256&height=256&seed=-1",
            { method: "GET" },
        );
        expect(response.status).toBe(401);
        // No X-Cache header when cache is bypassed
        expect(response.headers.get("X-Cache")).toBeNull();
        await response.text();
    });

    test("convenience URL /image/* rewrites to /api/generate/image/*", async () => {
        await populateCache("/image/test-rewrite?model=flux&seed=42");

        // Request via convenience URL
        const response = await SELF.fetch(
            "http://localhost/image/test-rewrite?model=flux&seed=42",
            { method: "GET" },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");

        await response.arrayBuffer();
    });
});
