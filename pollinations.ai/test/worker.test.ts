import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/worker.ts";

interface Env {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
}

function envReturning(contentType: string): Env {
    return {
        ASSETS: {
            fetch: async () =>
                new Response("<html><head></head><body></body></html>", {
                    status: 200,
                    headers: { "content-type": contentType },
                }),
        },
    };
}

test("a missing static asset returns 404 instead of the HTML shell", async () => {
    const env = envReturning("text/html; charset=utf-8");
    const request = new Request(
        "https://pollinations.ai/assets/index-abc123.js",
    );

    const response = await worker.fetch(request, env);

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /text\/plain/);
});
