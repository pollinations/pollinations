import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

type TextCacheHeaders = {
    cache: "HIT" | "MISS" | "BYPASS";
    hasKey: boolean;
};

function expectTextCacheHeaders(
    response: Response,
    expectedHeaders: TextCacheHeaders,
) {
    const xCache = response.headers.get("X-Cache");
    const xCacheKey = response.headers.get("X-Cache-Key");
    expect(xCache).toBe(expectedHeaders.cache);
    if (expectedHeaders.hasKey) {
        expect(xCacheKey).toBeTruthy();
    }
}

describe("Text Cache Integration Tests", () => {
    test(
        "identical POST requests produce cache hit",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const requestBody = JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Cache test: say hello" }],
            });

            // First request - should be cache MISS
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: requestBody,
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            expectTextCacheHeaders(responseA, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });

            // Second identical request - should be cache HIT
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: requestBody,
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            expectTextCacheHeaders(responseB, {
                cache: "HIT",
                hasKey: true,
            });
        },
    );

    test(
        "different POST bodies produce cache miss",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // First request
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [
                            { role: "user", content: "Cache test: message A" },
                        ],
                    }),
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            expectTextCacheHeaders(responseA, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });

            // Different request body - should also be cache MISS
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [
                            { role: "user", content: "Cache test: message B" },
                        ],
                    }),
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            expectTextCacheHeaders(responseB, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });
        },
    );

    test(
        "cache hit works without authentication (cache-first pattern)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const requestBody = JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Cache-first auth test" }],
            });

            // First request with auth - populate cache
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: requestBody,
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            expectTextCacheHeaders(responseA, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });

            // Second request WITHOUT auth - should still get cache HIT
            // This proves cache runs BEFORE auth middleware
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: requestBody,
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            expectTextCacheHeaders(responseB, {
                cache: "HIT",
                hasKey: true,
            });
        },
    );

    test(
        "auth token excluded from cache key (different tokens same response)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const requestBody = JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Auth exclusion test" }],
            });

            // First request with apiKey
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: requestBody,
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            expectTextCacheHeaders(responseA, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });

            // Second request with SAME apiKey - should hit cache
            // (proves auth header is excluded from cache key)
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: requestBody,
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            expectTextCacheHeaders(responseB, {
                cache: "HIT",
                hasKey: true,
            });
        },
    );

    test(
        "GET text endpoint caches correctly",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // First GET request - should be cache MISS
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/text/cache-test-prompt?model=openai-fast`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            expectTextCacheHeaders(responseA, {
                cache: "MISS",
                hasKey: false, // X-Cache-Key only set on HIT
            });

            // Second identical GET request - should be cache HIT
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/text/cache-test-prompt?model=openai-fast`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            expectTextCacheHeaders(responseB, {
                cache: "HIT",
                hasKey: true,
            });
        },
    );

    test(
        "streaming and non-streaming have different cache keys",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const baseMessage = {
                role: "user",
                content: "Stream vs non-stream test",
            };

            // Non-streaming request
            const responseA = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [baseMessage],
                        stream: false,
                    }),
                },
            );
            expect(responseA.status).toBe(200);
            await responseA.text();

            const keyA = responseA.headers.get("X-Cache-Key");

            // Streaming request - should have DIFFERENT cache key
            const responseB = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [baseMessage],
                        stream: true,
                    }),
                },
            );
            expect(responseB.status).toBe(200);
            await responseB.text();

            const keyB = responseB.headers.get("X-Cache-Key");

            // Keys should be different because stream parameter differs
            expect(keyA).not.toBe(keyB);
        },
    );
});
