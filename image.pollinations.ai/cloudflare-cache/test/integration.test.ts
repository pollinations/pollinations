import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest, beforeEach, describe, expect } from "vitest";
import worker from "../src";
import { MockVectorize } from "./mock-vectorize";

const test = baseTest.extend<{ env: Cloudflare.Env }>({
    env: async ({ task: _ }, use) => {
        await use({
            ...env,
            VECTORIZE_INDEX: new MockVectorize(),
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
            new Request(`http://localhost:8787/prompt/${prompt}`),
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
            new Request(`http://localhost:8787/prompt/${prompt}`),
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

        // wait for eventual consistency
        await pollUntilVectorCount(env.VECTORIZE_INDEX, 0);

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

        // // wait for eventual consistency
        // const vecB = (await env.AI.run("@cf/baai/bge-m3", {
        //     text: promptB,
        // })) as BGEM3OuputEmbedding;
        // const matches = await env.VECTORIZE_INDEX.query(vecB.data[0]);
        // expect(matches.matches.length).toBe(1);

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

async function getVectorIds(
    index: Vectorize,
    dimension: number = 1024,
    topK: number = 100,
): Promise<string[]> {
    const zeroVector = new Array(dimension).fill(0);
    const results = await index.query(zeroVector, { topK });
    return results.matches.map((match) => match.id);
}

async function clearVectorizeIndex(index: Vectorize, dimension: number) {
    console.log("Clearing Vectorize index...");

    const ids = await getVectorIds(index, dimension);
    console.log(`Found ${ids.length} vectors to delete.`);
    await index.deleteByIds(ids);

    await pollUntilCleared(index);
    expect((await getVectorIds(index, dimension)).length).toBe(0);
    console.log("Vectorize index cleared.");
}

async function pollUntilCleared(index: Vectorize, timeoutMs: number = 60000) {
    console.log("Waiting for Vectorize index to clear...");
    await pollUntilVectorCount(index, 0, timeoutMs);
}

async function pollUntilVectorCount(
    index: Vectorize,
    count: number,
    timeoutMs: number = 60000,
) {
    const startTime = Date.now();
    while ((await getVectorIds(index)).length !== count) {
        if (startTime + timeoutMs < Date.now()) {
            console.log(
                `pollUntilVectorCount(_, ${count}) timed out after ${timeoutMs}ms`,
            );
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}
