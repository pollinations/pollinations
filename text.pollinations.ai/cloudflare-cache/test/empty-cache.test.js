import assert from "node:assert/strict";
import { test, vi } from "vitest";
import worker, { getCachedResponse } from "../src/index.js";

test("treats an empty cached object as a miss", async () => {
    const env = {
        TEXT_BUCKET: {
            get: async () => ({
                size: 0,
                uploaded: new Date(),
                customMetadata: {},
                body: null,
            }),
        },
    };

    assert.equal(await getCachedResponse(env, "key"), null);
});

test("does not store a HEAD response under the GET key", async () => {
    const puts = [];
    const env = {
        ORIGIN_HOST: "origin.test",
        TEXT_BUCKET: {
            get: async () => null,
            put: async (key) => puts.push(key),
        },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
            new Response(null, {
                headers: {
                    "content-length": "12",
                    "content-type": "text/plain",
                },
            }),
    );
    const pending = [];

    const response = await worker.fetch(
        new Request("https://text.pollinations.ai/hello", { method: "HEAD" }),
        env,
        { waitUntil: (promise) => pending.push(promise) },
    );
    await Promise.all(pending);

    assert.equal(response.status, 200);
    assert.deepEqual(puts, []);
});
