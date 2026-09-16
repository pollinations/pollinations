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

test("parseApiError provides generic fallback when 403 body has no details", () => {
    const message = parseApiError(403, "");
    assert.equal(
        message,
        "Access forbidden. Your API key may not have permission for this operation.",
    );
});
