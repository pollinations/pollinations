import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test, describe, expect } from "vitest";
import worker from "../src";

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

describe("Exact Cache Integration Tests", () => {
    test("identical requests produce exact cache hit", async () => {
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

    test("different requests produce cache miss", async () => {
        const [promptA, promptB] = [
            "A big shark wearing a tuxedo",
            "A small fish wearing a hat",
        ];

        let ctx = createExecutionContext();
        const responseA = await worker.fetch(
            new Request(`http://localhost:8787/prompt/${promptA}?seed=1`),
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
            new Request(`http://localhost:8787/prompt/${promptB}?seed=2`),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(responseB.status).toBe(200);
        await responseB.arrayBuffer();

        expectCacheHeaders(responseB, {
            cache: "MISS",
            cacheType: null,
        });
    }, 120000);
});
