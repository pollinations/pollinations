import assert from "node:assert/strict";
import { test, vi } from "vitest";
import worker from "../src/index.js";

test("a cache miss stores only the response, without the request URL", async () => {
    const puts = [];
    const env = {
        ORIGIN_HOST: "origin.test",
        TEXT_BUCKET: {
            get: async () => null,
            put: async (key, _body, options) =>
                puts.push({ key, metadata: options?.customMetadata ?? {} }),
        },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
            new Response("hello", {
                headers: {
                    "content-length": "5",
                    "content-type": "text/plain",
                },
            }),
    );
    const pending = [];

    const response = await worker.fetch(
        new Request(
            "https://text.pollinations.ai/a%20private%20prompt?token=secret",
        ),
        env,
        { waitUntil: (promise) => pending.push(promise) },
    );
    await response.text();
    await Promise.all(pending);

    assert.equal(puts.length, 1);
    assert.equal(puts[0].metadata.originalUrl, undefined);
    assert.equal(puts[0].metadata.hasRequestBody, undefined);
    assert.equal(puts[0].metadata.status, "200");
});
