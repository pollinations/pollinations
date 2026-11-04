import assert from "node:assert/strict";
import test from "node:test";
import { parseApiError } from "../src/utils/coreUtils.js";

test("parseApiError displays gateway 403 error message with editor link unchanged", () => {
    const errorJson = JSON.stringify({
        error: {
            message:
                "Model 'flux' is not allowed for this API key. Manage key permissions at https://enter.pollinations.ai/edit-key?id=test-key-123",
        },
    });
    const message = parseApiError(403, errorJson);
    assert.equal(
        message,
        "Model 'flux' is not allowed for this API key. Manage key permissions at https://enter.pollinations.ai/edit-key?id=test-key-123",
    );
});

test("parseApiError displays non-permission 403 error message unchanged", () => {
    const errorJson = JSON.stringify({
        error: { message: "Account is banned" },
    });
    const message = parseApiError(403, errorJson);
    assert.equal(message, "Account is banned");
});

test("parseApiError displays staging access restriction 403 message unchanged", () => {
    const errorJson = JSON.stringify({
        error: {
            message: "Access to staging is restricted to allowlisted users",
        },
    });
    const message = parseApiError(403, errorJson);
    assert.equal(
        message,
        "Access to staging is restricted to allowlisted users",
    );
});

test("429 errors preserve the gateway cooldown retry duration", () => {
    const errorJson = JSON.stringify({
        error: "Rate limit exceeded",
        message:
            "Rate limit exceeded. Retry after 37.5s. Use secret keys (sk_*) for unlimited requests.",
        retryAfterSeconds: 37.5,
    });
    const message = parseApiError(429, errorJson);
    assert.equal(
        message,
        "Rate limit exceeded. Retry after 37.5s. Use secret keys (sk_*) for unlimited requests.",
    );
});

test("parseApiError displays gateway 402 error message unchanged", () => {
    const errorJson = JSON.stringify({
        error: {
            message:
                "API key budget too low. This request costs ~0.0100 pollen, but this key has 0.0000. Increase the key budget at https://enter.pollinations.ai/edit-key?id=test-key-123; topping up the wallet does not increase this limit.",
            code: "KEY_BUDGET_EXHAUSTED",
        },
    });
    const message = parseApiError(402, errorJson);
    assert.equal(
        message,
        "API key budget too low. This request costs ~0.0100 pollen, but this key has 0.0000. Increase the key budget at https://enter.pollinations.ai/edit-key?id=test-key-123; topping up the wallet does not increase this limit.",
    );
});

test("parseApiError provides generic fallback when 402 body has no details", () => {
    const message = parseApiError(402, "");
    assert.equal(
        message,
        "Insufficient pollen balance or API key budget exhausted.",
    );
});

test("parseApiError provides generic fallback when 403 body has no details", () => {
    const message = parseApiError(403, "");
    assert.equal(
        message,
        "Access forbidden. Your API key may not have permission for this operation.",
    );
});
