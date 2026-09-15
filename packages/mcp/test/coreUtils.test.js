import assert from "node:assert/strict";
import test from "node:test";
import { parseApiError } from "../src/utils/coreUtils.js";

test("parseApiError surfaces key management link for 403 when error has no link", () => {
    const errorJson = JSON.stringify({
        error: { message: "Model 'flux' is not allowed for this API key" },
    });
    const message = parseApiError(403, errorJson);
    assert.equal(
        message,
        "Access forbidden. Model 'flux' is not allowed for this API key. Manage key permissions at https://enter.pollinations.ai/keys",
    );
});

test("parseApiError preserves upstream link if already present in 403 error", () => {
    const errorJson = JSON.stringify({
        error: {
            message:
                "Model 'flux' is not allowed for this API key. Manage key permissions at https://enter.pollinations.ai/keys",
        },
    });
    const message = parseApiError(403, errorJson);
    assert.equal(
        message,
        "Access forbidden. Model 'flux' is not allowed for this API key. Manage key permissions at https://enter.pollinations.ai/keys",
    );
});

test("parseApiError provides default message with link when 403 body has no details", () => {
    const message = parseApiError(403, "");
    assert.equal(
        message,
        "Access forbidden. Your API key may not have permission for this operation. Manage key permissions at https://enter.pollinations.ai/keys",
    );
});
