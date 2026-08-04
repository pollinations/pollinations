import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest, describe, expect } from "vitest";
import worker from "../src";
import { generateLegacyCacheKey } from "../src/cache-utils.ts";
import { createMockVectorize } from "./mock-vectorize";

const test = baseTest.extend<{ env: Cloudflare.Env }>({
    env: async ({ task: _ }, use) => {
        await use({
            ...env,
            VECTORIZE_INDEX: createMockVectorize(),
        });
    },
});

type CacheHeaders = {
    cache: "HIT" | "MISS";
    cacheType: "EXACT" | "SEMANTIC" | null;
};

function expectCacheHeaders(response: Response, expectedHeaders: CacheHeaders) {
    const xCache = response.headers.get("X-Cache");
    const xCacheType = response.headers.get("X-Cache-Type");
    expect(xCache).toBe(expectedHeaders.cache);
    expect(xCacheType).toBe(expectedHeaders.cacheType);
}

describe("Cache Integration Tests", () => {
    test("identical requests produce direct cache hit", async ({ env }) => {
        const prompt = "A red car driving fast";

        let ctx = createExecutionContext();
        const responseA = await worker.fetch(
            new Request(`http://localhost:8787/prompt/${prompt}?seed=12`),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(responseA.status).toBe(200);
        await responseA.arrayBuffer();

        expectCacheHeaders(responseA, {
            cache: "MISS",
            cacheType: null,
        });

        ctx = createExecutionContext();
        const responseB = await worker.fetch(
            new Request(`http://localhost:8787/prompt/${prompt}?seed=12`),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(responseB.status).toBe(200);
        await responseB.arrayBuffer();

        expectCacheHeaders(responseB, {
            cache: "HIT",
            cacheType: "EXACT",
        });
    }, 120000);

    test("similar requests produce a semantic cache hit", async ({ env }) => {
        const [promptA, promptB] = [
            "A biig shark wearing a tuxedo.",
            "A biiig shark wearing a tuxedo.",
        ];

        let ctx = createExecutionContext();
        const responseA = await worker.fetch(
            new Request(`http://localhost:8787/prompt/${promptA}`),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(responseA.status).toBe(200);
        await responseA.arrayBuffer();

        expectCacheHeaders(responseA, {
            cache: "MISS",
            cacheType: null,
        });

        ctx = createExecutionContext();
        const responseB = await worker.fetch(
            new Request(`http://localhost:8787/prompt/${promptB}`),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(responseB.status).toBe(200);
        await responseB.arrayBuffer();

        expectCacheHeaders(responseB, {
            cache: "HIT",
            cacheType: "SEMANTIC",
        });
    }, 120000);

    test("DELETE removes legacy unversioned cache entries", async ({ env }) => {
        const imageUrl = new URL(
            "http://localhost:8787/prompt/legacy-delete?width=512&height=512",
        );
        const legacyCacheKey = generateLegacyCacheKey(imageUrl);
        await env.IMAGE_BUCKET.put(legacyCacheKey, new Uint8Array([1]));

        const response = await worker.fetch(
            new Request(
                "http://localhost:8787/delete/prompt/legacy-delete?width=512&height=512",
                { method: "DELETE" },
            ),
            env,
            createExecutionContext(),
        );

        expect(response.status).toBe(200);
        expect(await env.IMAGE_BUCKET.head(legacyCacheKey)).toBeNull();
    });
});
