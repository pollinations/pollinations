import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

type CacheHeaders = {
    cache: "HIT" | "MISS";
    cacheType: "EXACT" | null;
};

function expectCacheHeaders(response: Response, expectedHeaders: CacheHeaders) {
    const xCache = response.headers.get("X-Cache");
    const xCacheType = response.headers.get("X-Cache-Type");
    expect(xCache).toBe(expectedHeaders.cache);
    expect(xCacheType).toBe(expectedHeaders.cacheType);
}

describe("Image Integration Tests", () => {
    test(
        "identical image requests produce exact cache hit",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // First request - should be cache MISS
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-1?model=flux&width=256&height=256&seed=42`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.arrayBuffer();

            expectCacheHeaders(responseA, {
                cache: "MISS",
                cacheType: null,
            });

            // Second identical request - should be cache HIT
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-1?model=flux&width=256&height=256&seed=42`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.arrayBuffer();

            expectCacheHeaders(responseB, {
                cache: "HIT",
                cacheType: "EXACT",
            });
        },
    );

    test(
        "cache hit works without authentication (cache-first pattern)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // First request with auth - populate cache
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-2?model=flux&width=256&height=256&seed=99`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.arrayBuffer();

            expectCacheHeaders(responseA, {
                cache: "MISS",
                cacheType: null,
            });

            // Second request WITHOUT auth - should still get cache HIT
            // This proves cache runs BEFORE auth middleware
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-2?model=flux&width=256&height=256&seed=99`,
                {
                    method: "GET",
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.arrayBuffer();

            expectCacheHeaders(responseB, {
                cache: "HIT",
                cacheType: "EXACT",
            });
        },
    );

    test(
        "different image requests produce cache miss",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // First request
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-3?model=flux&width=256&height=256&seed=1`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.arrayBuffer();

            expectCacheHeaders(responseA, {
                cache: "MISS",
                cacheType: null,
            });

            // Different request - should also be cache MISS
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-cache-4?model=flux&width=256&height=256&seed=2`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.arrayBuffer();

            expectCacheHeaders(responseB, {
                cache: "MISS",
                cacheType: null,
            });
        },
    );

    test(
        "prompts with newlines are routed correctly (not 404)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test prompt with URL-encoded newlines (%0A)
            // This was previously returning 404 because .+ regex doesn't match newlines
            const promptWithNewlines = "line1%0Aline2%0Aline3";
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/${promptWithNewlines}?model=flux&width=256&height=256&seed=42`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            // Should return 200, not 404
            expect(response.status).toBe(200);
            await response.arrayBuffer();
        },
    );

    test(
        "gptimage-large with reference image returns 200 (img2img edit mode)",
        { timeout: 60000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Use a small test image URL for reference image
            // This tests that gptimage-large correctly uses the /images/edits endpoint
            // which requires api-version=2025-04-01-preview (not the old 2024-02-01)
            const referenceImageUrl =
                "https://image.pollinations.ai/prompt/red%20circle?width=256&height=256&seed=1&nologo=true";
            const encodedImageUrl = encodeURIComponent(referenceImageUrl);

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/transform%20into%20blue?model=gptimage-large&width=256&height=256&seed=42&image=${encodedImageUrl}`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            // Should return 200, not 404 "Resource not found"
            // If this fails with 404, the API version is likely wrong (needs 2025-04-01-preview)
            expect(response.status).toBe(200);
            await response.arrayBuffer();
        },
    );
});
