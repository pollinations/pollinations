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
        "should use crypto balance when tier balance is exhausted",
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
