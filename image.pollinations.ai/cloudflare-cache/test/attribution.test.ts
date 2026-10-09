import { describe, expect, it } from "vitest";
import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../src";
import { createMockVectorize } from "./mock-vectorize";
import {
    ATTRIBUTION_HEADERS,
    addAttributionHeaders,
} from "../src/attribution.ts";
import { CACHE_VERSION, generateCacheKey } from "../src/cache-utils.ts";
import { getVersionedSemanticBucket } from "../src/middleware/semantic-cache.ts";

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

    it("versions semantic cache buckets so old unbranded images are bypassed", () => {
        expect(getVersionedSemanticBucket("1024x1024_nologofalse")).toBe(
            `${CACHE_VERSION}-1024x1024_nologofalse`,
        );
    });
});

describe("legacy migration headers", () => {
    // Mock Vectorize so nothing reaches a real Cloudflare account.
    const testEnv = { ...env, VECTORIZE_INDEX: createMockVectorize() };
    function expectMigrationHeaders(response: Response) {
        expect(response.headers.get("X-Pollinations-Migration")).toMatch(
            /LEGACY_MIGRATION\.md$/,
        );
        expect(response.headers.get("X-Pollinations-Docs")).toBe(
            "https://gen.pollinations.ai/docs",
        );
        expect(response.headers.get("X-Pollinations-Signup")).toBe(
            "https://enter.pollinations.ai/?ref=image",
        );
        expect(response.headers.get("Link")).toMatch(/rel="deprecation"/);
    }

    it("adds migration headers to exact cache hits and keeps attribution", async () => {
        const url = "http://localhost:8787/prompt/migration-header-hit?seed=7";
        const cacheKey = generateCacheKey(new URL(url));
        await testEnv.IMAGE_BUCKET.put(cacheKey, new Uint8Array([0xff, 0xd8]), {
            httpMetadata: { contentType: "image/jpeg" },
        });

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(url, { headers: { Origin: "https://example.com" } }),
            testEnv,
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expectMigrationHeaders(response);
        expect(response.headers.get("Link")).toContain(
            '<https://pollinations.ai>; rel="service"',
        );
        const exposed = response.headers.get("Access-Control-Expose-Headers");
        expect(exposed).toContain("X-Pollinations-Migration");
        expect(exposed).toContain("X-Error-Message");
        expect(exposed).toContain("X-Rate-Limited");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([0xff, 0xd8]),
        );
    });

    it("adds migration headers to Worker error responses", async () => {
        // Turnstile rejects a localhost origin without a token: a 403 built in
        // the Worker itself, before any cache or origin lookup.
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("http://localhost:8787/prompt/turnstile-reject", {
                headers: { Origin: "http://localhost:3000" },
            }),
            testEnv,
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(403);
        expectMigrationHeaders(response);
        expect(response.headers.get("X-Powered-By")).toBeNull();
    });
});
