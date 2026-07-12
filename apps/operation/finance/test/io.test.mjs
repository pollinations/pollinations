import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedModelSecrets } from "../lib/io.mjs";

test("shared model secrets do not override finance AWS CLI credentials", () => {
    const target = {
        AWS_ACCESS_KEY_ID: "finance-access-key",
    };

    mergeSharedModelSecrets(
        {
            AWS_ACCESS_KEY_ID: "bedrock-access-key",
            AWS_SECRET_ACCESS_KEY: "bedrock-secret-key",
            AWS_SESSION_TOKEN: "bedrock-session-token",
            DEEPINFRA_API_KEY: "deepinfra-key",
            NON_STRING_SECRET: 123,
        },
        target,
    );

    assert.deepEqual(target, {
        AWS_ACCESS_KEY_ID: "finance-access-key",
        DEEPINFRA_API_KEY: "deepinfra-key",
    });
});
