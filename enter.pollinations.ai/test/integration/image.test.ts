import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

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
        "seed=-1 bypasses cache (random seed convention)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // First request with seed=-1
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-seed-minus1?model=flux&width=256&height=256&seed=-1`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.arrayBuffer();

            // seed=-1 should bypass cache (no X-Cache header)
            expect(responseA.headers.get("X-Cache")).toBeNull();

            // Second identical request with seed=-1 - should also bypass cache
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-seed-minus1?model=flux&width=256&height=256&seed=-1`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.arrayBuffer();

            // Should still bypass cache (not HIT)
            expect(responseB.headers.get("X-Cache")).toBeNull();
        },
    );

    test(
        "gptimage with reference image returns 200 (img2img edit mode)",
        { timeout: 60000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // This tests that gptimage correctly uses the /images/edits endpoint
            // which requires api-version=2025-04-01-preview (not the old 2024-02-01)
            // Regression: #7917 set gptimage to 2024-02-01, breaking edit mode
            // Use a static public image (not pollinations URL which may not resolve in test)
            const referenceImageUrl =
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";
            const encodedImageUrl = encodeURIComponent(referenceImageUrl);

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/transform%20into%20blue?model=gptimage&width=256&height=256&seed=42&image=${encodedImageUrl}`,
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

    test(
        "gptimage-large with reference image returns 200 (img2img edit mode)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // This tests that gptimage-large correctly uses the /images/edits endpoint
            // which requires api-version=2025-04-01-preview (not the old 2024-02-01)
            // Use a static public image (not pollinations URL which may not resolve in test)
            const referenceImageUrl =
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";
            const encodedImageUrl = encodeURIComponent(referenceImageUrl);

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/transform%20into%20blue?model=gptimage-large&width=256&height=256&seed=42&image=${encodedImageUrl}`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                },
            );

            // Should return 200, not 404 "Resource not found"
            // If this fails with 404, the API version is likely wrong (needs 2025-04-01-preview)
            expect(response.status).toBe(200);
            await response.arrayBuffer();
        },
    );

    test(
        "should return 402 when user has no balance",
        { timeout: 10000 },
        async ({ apiKey, mocks, sessionToken }) => {
            await mocks.enable("polar", "tinybird");
            const { drizzle } = await import("drizzle-orm/d1");
            const { env } = await import("cloudflare:test");
            const { user: userTable } = await import(
                "@/db/schema/better-auth.ts"
            );
            const { eq } = await import("drizzle-orm");

            const db = drizzle(env.DB);

            // Get the authenticated user ID from session
            const sessionResponse = await SELF.fetch(
                "http://localhost:3000/api/auth/get-session",
                {
                    headers: {
                        cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const session = await sessionResponse.json();
            const userId = session.user.id;

            // Set all balances to 0
            await db
                .update(userTable)
                .set({
                    tierBalance: 0,
                    packBalance: 0,
                    cryptoBalance: 0,
                })
                .where(eq(userTable.id, userId));

            // Try to generate image with no balance
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-no-balance?model=flux&width=256&height=256`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(402);
            const data = await response.json();
            // The error might be in a different format (error can be a string or array)
            const errorMessage = Array.isArray(data.error)
                ? data.error.join(" ")
                : typeof data.error === "string"
                  ? data.error
                  : data.message || JSON.stringify(data);
            expect(String(errorMessage).toLowerCase()).toContain("balance");
        },
    );

    test(
        "nanobanana-2 should return image/png (Gemini 3.1 Flash Image)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20cat%20on%20a%20rainbow?model=nanobanana-2&width=512&height=512&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("nanobanana-2 response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "p-image should return image",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20red%20apple?model=p-image&width=512&height=512&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("p-image response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "p-image-edit should return edited image",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Use picsum.photos — Wikipedia returns 403 to Pruna's server
            const referenceImageUrl = "https://picsum.photos/256/256";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/make%20it%20blue?model=p-image-edit&seed=42&image=${encodeURIComponent(referenceImageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("p-image-edit response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "kontext should return image (FLUX.1 Kontext via Azure)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20beautiful%20sunset?model=kontext&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("kontext response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "nanobanana should return image (Gemini 2.5 Flash Image)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20beautiful%20sunset?model=nanobanana&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("nanobanana response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "nanobanana-pro should return image (Gemini 3 Pro Image)",
        { timeout: 120000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20beautiful%20sunset?model=nanobanana-pro&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("nanobanana-pro response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "seedream5 should return image (ByteDance ARK Seedream 5.0)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20beautiful%20sunset?model=seedream5&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("seedream5 response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "zimage should return image (Z-Image Turbo)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20beautiful%20sunset?model=zimage&width=512&height=512&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("zimage response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    // Will pass once image service is redeployed with the 0.5K→1K fix
    test(
        "nanobanana-2 at 512x512 should map to 1K (not invalid 0.5K)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20red%20apple?model=nanobanana-2&width=512&height=512&seed=99`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "nanobanana-2 512x512 response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "nanobanana at 1024x768 should work (landscape aspect ratio)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20mountain%20landscape?model=nanobanana&width=1024&height=768&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "nanobanana 1024x768 response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "nanobanana-pro at 1920x1080 should work (2K tier)",
        { timeout: 120000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20city%20skyline?model=nanobanana-pro&width=1920&height=1080&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "nanobanana-pro 1920x1080 response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "kontext img2img should return edited image",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const referenceImageUrl = "https://picsum.photos/256/256";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/make%20it%20look%20like%20a%20painting?model=kontext&seed=42&image=${encodeURIComponent(referenceImageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("kontext img2img response:", response.status, body);
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "nanobanana-2 img2img should return edited image",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const referenceImageUrl = "https://picsum.photos/256/256";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/transform%20into%20a%20watercolor?model=nanobanana-2&seed=42&image=${encodeURIComponent(referenceImageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "nanobanana-2 img2img response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "should use crypto balance when tier balance is exhausted",
        { timeout: 30000 },
        async ({ apiKey, mocks, sessionToken }) => {
            await mocks.enable("polar", "tinybird");
            const { drizzle } = await import("drizzle-orm/d1");
            const { env } = await import("cloudflare:test");
            const { user: userTable } = await import(
                "@/db/schema/better-auth.ts"
            );
            const { eq } = await import("drizzle-orm");

            const db = drizzle(env.DB);

            // Get the authenticated user ID from session
            const sessionResponse = await SELF.fetch(
                "http://localhost:3000/api/auth/get-session",
                {
                    headers: {
                        cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const session = await sessionResponse.json();
            const userId = session.user.id;

            // Set tier to 0, crypto to 10
            await db
                .update(userTable)
                .set({
                    tierBalance: 0,
                    packBalance: 0,
                    cryptoBalance: 10,
                })
                .where(eq(userTable.id, userId));

            // Should succeed using crypto balance
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test-crypto-balance?model=flux&width=256&height=256&seed=42`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            await response.arrayBuffer();
        },
    );
});

/**
 * Qwen Image (Alibaba) Tests
 *
 * Cost: $0.03 per image (international)
 */
describe("Qwen Image Generation", () => {
    test(
        "qwen-image should return image (text-to-image)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20red%20panda%20eating%20bamboo?model=qwen-image&width=512&height=512&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("qwen-image response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "qwen-image should return edited image when image input provided",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const referenceImageUrl = "https://picsum.photos/256/256";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/make%20it%20look%20like%20a%20watercolor%20painting?model=qwen-image&seed=42&image=${encodeURIComponent(referenceImageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("qwen-image edit response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});

/**
 * Grok Imagine (xAI) Tests
 *
 * Cost: grok-imagine $0.02/image, grok-imagine-pro $0.07/image
 */
describe("Grok Imagine Generation", () => {
    test(
        "grok-imagine should return image (basic)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20red%20apple%20on%20a%20white%20table?model=grok-imagine&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("grok-imagine response:", response.status, body);
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "grok-imagine-pro should return image (pro)",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20sunset%20over%20mountains?model=grok-imagine-pro&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "grok-imagine-pro response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    test(
        "grok-imagine with landscape aspect ratio should work",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20mountain%20landscape?model=grok-imagine&width=1920&height=1080&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "grok-imagine landscape response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});

/**
 * Grok Video Pro (xAI) Tests
 *
 * Cost: $0.07/sec at 720p
 */
describe("Grok Video Pro Generation", () => {
    test(
        "grok-video-pro T2V should return video/mp4",
        { timeout: 180000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20cat%20walking%20on%20grass?model=grok-video-pro&duration=3`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("grok-video-pro response:", response.status, body);
            }

            expect(response.status).toBe(200);
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});

describe("POST /v1/images/generations", () => {
    test(
        "returns b64_json response by default",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/generations`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "a red circle on white background",
                        model: "flux",
                        size: "256x256",
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                created: number;
                data: { b64_json?: string; revised_prompt?: string }[];
            };
            expect(data.created).toBeTypeOf("number");
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
            expect(data.data[0].b64_json?.length).toBeGreaterThan(100);
            expect(data.data[0].revised_prompt).toBe(
                "a red circle on white background",
            );
        },
    );

    test("requires authentication", { timeout: 10000 }, async ({ mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/images/generations`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    prompt: "test",
                    model: "flux",
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test(
        "forwards Pollinations-specific passthrough params",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/generations`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "a green triangle",
                        model: "flux",
                        size: "256x256",
                        seed: 42,
                        nologo: true,
                        enhance: false,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                data: { b64_json?: string }[];
            };
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
        },
    );
});

describe("POST /v1/images/edits", () => {
    const testImageUrl =
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";

    test(
        "edits image with JSON body and image URL string",
        { timeout: 60000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/edits`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "make it blue",
                        model: "flux",
                        image: testImageUrl,
                        size: "256x256",
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                created: number;
                data: { b64_json?: string; revised_prompt?: string }[];
            };
            expect(data.created).toBeTypeOf("number");
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
            expect(data.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );

    test(
        "edits image with JSON body and OpenAI image_url array format",
        { timeout: 60000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/edits`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "add a red border",
                        model: "flux",
                        image: [{ image_url: testImageUrl }],
                        size: "256x256",
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                data: { b64_json?: string }[];
            };
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
        },
    );

    test(
        "edits image with multipart form data file upload",
        { timeout: 60000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const imageResponse = await fetch(testImageUrl);
            const imageBuffer = await imageResponse.arrayBuffer();

            const formData = new FormData();
            formData.append("prompt", "make it green");
            formData.append("model", "flux");
            formData.append("size", "256x256");
            formData.append(
                "image",
                new Blob([imageBuffer], { type: "image/png" }),
                "test.png",
            );

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/edits`,
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                data: { b64_json?: string }[];
            };
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
        },
    );

    test("requires authentication", { timeout: 10000 }, async ({ mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/images/edits`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    prompt: "test",
                    model: "flux",
                    image: testImageUrl,
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test(
        "returns 400 when image is missing",
        { timeout: 10000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/images/edits`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "test",
                        model: "flux",
                    }),
                },
            );
            expect(response.status).toBe(400);
            await response.text();
        },
    );
});
