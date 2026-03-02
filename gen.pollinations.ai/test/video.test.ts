import { env, SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { generateCacheKey } from "../src/utils/image-cache.ts";

// Minimal MP4 header bytes for cache tests
const TINY_MP4 = new Uint8Array([
    0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x6d, 0x70, 0x34, 0x31,
]);

async function populateCache(path: string): Promise<void> {
    const testUrl = new URL(`http://localhost/api/generate${path}`);
    const cacheKey = generateCacheKey(testUrl);
    await env.IMAGE_BUCKET.put(cacheKey, TINY_MP4.buffer, {
        httpMetadata: { contentType: "video/mp4" },
    });
}

describe("Video Generation Tests", () => {
    test("video generation requires authentication", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/video/test?model=seedance",
            { method: "GET" },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test("cached video returns X-Cache: HIT from R2", async () => {
        await populateCache(
            "/video/test-cached?model=seedance&duration=2&seed=42",
        );

        const response = await SELF.fetch(
            "http://localhost/api/generate/video/test-cached?model=seedance&duration=2&seed=42",
            { method: "GET" },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");

        const body = await response.arrayBuffer();
        expect(body.byteLength).toBe(TINY_MP4.byteLength);
    });

    test("convenience URL /video/* rewrites to /api/generate/video/*", async () => {
        await populateCache("/video/test-rewrite?model=seedance&seed=42");

        const response = await SELF.fetch(
            "http://localhost/video/test-rewrite?model=seedance&seed=42",
            { method: "GET" },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");

        await response.arrayBuffer();
    });

    test("seed=-1 bypasses video cache", async () => {
        await populateCache("/video/test-bypass?model=seedance&seed=-1");

        const response = await SELF.fetch(
            "http://localhost/api/generate/video/test-bypass?model=seedance&seed=-1",
            { method: "GET" },
        );
        // Bypassed cache → auth → 401
        expect(response.status).toBe(401);
        expect(response.headers.get("X-Cache")).toBeNull();
        await response.text();
    });
});
