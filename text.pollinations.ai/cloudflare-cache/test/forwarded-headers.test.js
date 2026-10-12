import assert from "node:assert/strict";
import { test, vi } from "vitest";
import worker, { prepareForwardedHeaders } from "../src/index.js";

test("drops a client-sent cloudfront-viewer-address so callers cannot pick their IP", () => {
    const headers = prepareForwardedHeaders(
        new Headers({
            "cf-connecting-ip": "198.51.100.7",
            "cloudfront-viewer-address": "203.0.113.9:443",
        }),
        new URL("https://text.pollinations.ai/hello"),
    );

    assert.equal(headers.get("cloudfront-viewer-address"), null);
    assert.equal(headers.get("x-forwarded-for"), "198.51.100.7");
    assert.equal(headers.get("cf-connecting-ip"), "198.51.100.7");
});

test("a path starting with // still goes to the origin host", async () => {
    let fetched;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
        fetched = new URL(request.url);
        return new Response("ok", { status: 404 });
    });
    const env = {
        ORIGIN_HOST: "origin.test",
        TEXT_BUCKET: { get: async () => null },
    };

    await worker.fetch(
        new Request("https://text.pollinations.ai//other.example/page?a=1"),
        env,
        { waitUntil: () => {} },
    );

    assert.equal(fetched.host, "origin.test");
    assert.equal(fetched.pathname, "//other.example/page");
    assert.equal(fetched.search, "?a=1");
});
