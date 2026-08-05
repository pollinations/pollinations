import assert from "node:assert/strict";
import test from "node:test";
import { withAttributionHeaders } from "../src/index.js";

test("adds Pollinations attribution without changing the response body", async () => {
    const response = withAttributionHeaders(
        new Response("generated text", {
            headers: { "Access-Control-Expose-Headers": "X-Usage" },
        }),
    );

    assert.equal(response.headers.get("X-Powered-By"), "Pollinations.AI");
    assert.equal(
        response.headers.get("Link"),
        '<https://pollinations.ai>; rel="service"',
    );
    assert.match(
        response.headers.get("X-Pollinations-Logo"),
        /lockup-horizontal-black\.svg$/,
    );
    assert.match(
        response.headers.get("Access-Control-Expose-Headers"),
        /X-Usage/,
    );
    assert.equal(await response.text(), "generated text");
});

test("adds attribution to rate-limit fallbacks", async () => {
    const response = withAttributionHeaders(
        new Response("rate limited", { status: 429 }),
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("X-Powered-By"), "Pollinations.AI");
    assert.equal(
        response.headers.get("Link"),
        '<https://pollinations.ai>; rel="service"',
    );
    assert.match(
        response.headers.get("X-Pollinations-Logo"),
        /lockup-horizontal-black\.svg$/,
    );
    assert.equal(await response.text(), "rate limited");
});

test("does not change other error responses", () => {
    const response = withAttributionHeaders(
        new Response("server error", { status: 500 }),
    );

    assert.equal(response.headers.get("X-Powered-By"), null);
});
