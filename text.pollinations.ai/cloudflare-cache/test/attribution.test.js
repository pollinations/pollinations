import assert from "node:assert/strict";
import test from "node:test";
import { withAttributionHeaders, withMigrationHeaders } from "../src/index.js";

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

test("does not change error responses reserved for future fallbacks", () => {
    const response = withAttributionHeaders(
        new Response("rate limited", { status: 429 }),
    );

    assert.equal(response.headers.get("X-Powered-By"), null);
});

test("adds migration links to every response, errors included", async () => {
    const response = withMigrationHeaders(
        withAttributionHeaders(
            new Response("rate limited", {
                status: 429,
                headers: { "Access-Control-Expose-Headers": "X-Usage" },
            }),
        ),
    );

    assert.equal(response.status, 429);
    assert.match(
        response.headers.get("X-Pollinations-Migration"),
        /LEGACY_MIGRATION\.md$/,
    );
    assert.equal(
        response.headers.get("X-Pollinations-Docs"),
        "https://gen.pollinations.ai/docs",
    );
    assert.equal(
        response.headers.get("X-Pollinations-Signup"),
        "https://enter.pollinations.ai/?ref=text",
    );
    assert.match(response.headers.get("Link"), /rel="deprecation"/);
    const exposed = response.headers.get("Access-Control-Expose-Headers");
    assert.match(exposed, /X-Usage/);
    assert.match(exposed, /X-Pollinations-Migration/);
    assert.match(exposed, /X-Pollinations-Signup/);
    assert.equal(await response.text(), "rate limited");
});

test("keeps the attribution Link next to the migration Link", () => {
    const response = withMigrationHeaders(
        withAttributionHeaders(new Response("ok")),
    );
    const link = response.headers.get("Link");

    assert.match(link, /<https:\/\/pollinations\.ai>; rel="service"/);
    assert.match(link, /rel="successor-version"/);
});
