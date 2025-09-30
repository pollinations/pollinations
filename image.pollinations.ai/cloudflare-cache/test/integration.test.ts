import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest, describe, expect } from "vitest";
import worker from "../src";
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
});
