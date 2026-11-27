import assert from "node:assert/strict";
import test from "node:test";
import { hasAgentRunToken, validateAgentRunToken } from "./auth.js";

function request(authorization) {
    return new Request("https://brick.pollinations.ai/v1/chat/completions", {
        headers: authorization ? { authorization } : {},
    });
}

test("accepts only a delegated agent bearer", () => {
    assert.equal(
        hasAgentRunToken(request("Bearer ag_header.payload.sig")),
        true,
    );
    assert.equal(hasAgentRunToken(request("bearer ag_token")), true);
    assert.equal(hasAgentRunToken(request("Bearer sk_owner")), false);
    assert.equal(hasAgentRunToken(request("Bearer pk_caller")), false);
    assert.equal(hasAgentRunToken(request("Bearer ag_ extra")), false);
    assert.equal(hasAgentRunToken(request()), false);
});

test("validates delegated tokens without exposing the response", async () => {
    let received;
    const valid = await validateAgentRunToken(
        request("Bearer ag_delegated"),
        async (url, init) => {
            received = { url, authorization: init.headers.authorization };
            return Response.json({ valid: true });
        },
    );
    assert.equal(valid, true);
    assert.deepEqual(received, {
        url: "https://gen.pollinations.ai/account/key",
        authorization: "Bearer ag_delegated",
    });
});

test("rejects failed token introspection", async () => {
    const valid = await validateAgentRunToken(
        request("Bearer ag_invalid"),
        async () => new Response(null, { status: 401 }),
    );
    assert.equal(valid, false);
});
