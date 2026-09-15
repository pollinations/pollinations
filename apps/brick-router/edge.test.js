import assert from "node:assert/strict";
import test from "node:test";
import { handleAtEdge } from "./edge.js";

test("serves health checks at the edge", async () => {
    for (const path of ["/", "/health"]) {
        const response = await handleAtEdge(
            new Request(`https://brick.pollinations.ai${path}`),
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            service: "brick",
            status: "ok",
        });
    }
});

test("rejects direct API keys at the edge", async () => {
    const response = await handleAtEdge(
        new Request("https://brick.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { authorization: "Bearer sk_direct" },
        }),
    );
    assert.equal(response.status, 401);
});

test("forwards validated delegated requests to the container", async () => {
    const response = await handleAtEdge(
        new Request("https://brick.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { authorization: "Bearer ag_delegated" },
        }),
        async () => true,
    );
    assert.equal(response, null);
});

test("fails closed when token validation is unavailable", async () => {
    const response = await handleAtEdge(
        new Request("https://brick.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { authorization: "Bearer ag_delegated" },
        }),
        async () => {
            throw new Error("offline");
        },
    );
    assert.equal(response.status, 503);
});
