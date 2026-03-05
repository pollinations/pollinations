import { env, SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { generateCacheKey } from "../src/utils/text-cache.ts";

const CACHED_RESPONSE_BODY = JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [
        {
            message: { role: "assistant", content: "Hello from cache!" },
            index: 0,
            finish_reason: "stop",
        },
    ],
});

/** Pre-populate TEXT_BUCKET with a cached response for the given request */
async function populateTextCache(
    method: string,
    url: string,
    body?: string,
): Promise<string> {
    const request = new Request(url, { method, body });
    const cacheKey = await generateCacheKey(request, body);
    await env.TEXT_BUCKET.put(cacheKey, CACHED_RESPONSE_BODY, {
        customMetadata: {
            response_content_type: "application/json",
            status: "200",
            statusText: "OK",
            cachedAt: new Date().toISOString(),
        },
    });
    return cacheKey;
}

describe("Text Cache Integration Tests", () => {
    test("cached POST response returns X-Cache: HIT from R2", async () => {
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Cache test: say hello" }],
        });
        await populateTextCache(
            "POST",
            "http://localhost/api/generate/v1/chat/completions",
            body,
        );

        // Request without auth — should hit cache before auth
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expect(response.headers.get("X-Cache-Key")).toBeTruthy();
        expect(response.headers.get("Cache-Control")).toBe(
            "public, max-age=31536000, immutable",
        );

        const data = await response.json();
        expect(data).toEqual(JSON.parse(CACHED_RESPONSE_BODY));
    });

    test("cache hit works without authentication (cache-first pattern)", async () => {
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Cache-first auth test" }],
        });
        await populateTextCache(
            "POST",
            "http://localhost/api/generate/v1/chat/completions",
            body,
        );

        // Request WITHOUT auth should still get cache HIT
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        await response.text();
    });

    test("different POST bodies produce cache miss", async () => {
        const bodyA = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Cache test: message A" }],
        });
        await populateTextCache(
            "POST",
            "http://localhost/api/generate/v1/chat/completions",
            bodyA,
        );

        // Different body - should not match cache
        const bodyB = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Cache test: message B" }],
        });
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: bodyB,
            },
        );

        // Not in cache → goes to auth → 401 (no auth)
        expect(response.status).toBe(401);
        await response.text();
    });

    test("seed=-1 in body bypasses text cache", async () => {
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Seed bypass test" }],
            seed: -1,
        });
        // Pre-populate cache for this exact body
        await populateTextCache(
            "POST",
            "http://localhost/api/generate/v1/chat/completions",
            body,
        );

        // Request with seed=-1 should bypass cache
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            },
        );

        // Bypassed cache → auth → 401
        expect(response.status).toBe(401);
        expect(response.headers.get("X-Cache")).toBeNull();
        await response.text();
    });

    test("seed=-1 in query param bypasses text cache for GET", async () => {
        await populateTextCache(
            "GET",
            "http://localhost/api/generate/text/bypass-test?model=openai-fast&seed=-1",
        );

        const response = await SELF.fetch(
            "http://localhost/api/generate/text/bypass-test?model=openai-fast&seed=-1",
            { method: "GET" },
        );

        // Bypassed cache → auth → 401
        expect(response.status).toBe(401);
        expect(response.headers.get("X-Cache")).toBeNull();
        await response.text();
    });

    test("cached response preserves content-type header", async () => {
        const body = JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "Content-type test" }],
        });
        await populateTextCache(
            "POST",
            "http://localhost/api/generate/v1/chat/completions",
            body,
        );

        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expect(response.headers.get("content-type")).toBe("application/json");
        await response.text();
    });

    test("/v1/models endpoint has no cache middleware", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/models",
            { method: "GET" },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBeNull();
        await response.text();
    });

    test("GET text cache hit via R2", async () => {
        await populateTextCache(
            "GET",
            "http://localhost/api/generate/text/cache-test-prompt?model=openai-fast",
        );

        const response = await SELF.fetch(
            "http://localhost/api/generate/text/cache-test-prompt?model=openai-fast",
            { method: "GET" },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        await response.text();
    });
});
