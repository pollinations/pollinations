import assert from "node:assert/strict";
import test from "node:test";
import { hasAgentRunToken } from "./auth.js";

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
