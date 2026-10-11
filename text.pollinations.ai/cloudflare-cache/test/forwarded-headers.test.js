import assert from "node:assert/strict";
import test from "node:test";
import { prepareForwardedHeaders } from "../src/index.js";

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
