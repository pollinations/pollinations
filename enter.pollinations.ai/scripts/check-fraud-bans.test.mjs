import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { FraudCheckError } from "../src/utils/stripe-fraud-score.ts";
import { fraudCheckErrorMessage } from "./check-fraud-bans.mjs";

test("missing CLI arguments produce an actionable error and nonzero exit", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--experimental-strip-types",
            fileURLToPath(new URL("./check-fraud-bans.mjs", import.meta.url)),
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--secrets-file is required/);
});

test("application-authored diagnostics are preserved", () => {
    assert.equal(
        fraudCheckErrorMessage(new FraudCheckError("Invalid D1 user page")),
        "Invalid D1 user page",
    );
    assert.equal(
        fraudCheckErrorMessage(
            new FraudCheckError("D1 query failed: HTTP 403"),
        ),
        "D1 query failed: HTTP 403",
    );
});

test("Stripe errors expose HTTP status but not response contents", () => {
    const error = new Stripe.errors.StripeAuthenticationError({
        message: "PRIVATE_CONTENT",
        statusCode: 401,
    });
    const message = fraudCheckErrorMessage(error);
    assert.match(message, /Stripe request failed.*HTTP 401/);
    assert.doesNotMatch(message, /PRIVATE_CONTENT/);
});

test("parser, filesystem, and unknown errors never expose raw contents", () => {
    for (const error of [
        new SyntaxError("PRIVATE_CONTENT"),
        new Error("PRIVATE_CONTENT"),
        "PRIVATE_CONTENT",
    ]) {
        assert.doesNotMatch(fraudCheckErrorMessage(error), /PRIVATE_CONTENT/);
    }
    assert.match(
        fraudCheckErrorMessage(new SyntaxError("PRIVATE_CONTENT")),
        /Invalid JSON/,
    );
    assert.match(
        fraudCheckErrorMessage({ code: "ENOENT", message: "PRIVATE_CONTENT" }),
        /file not found/,
    );
    assert.match(
        fraudCheckErrorMessage({ code: "EACCES", message: "PRIVATE_CONTENT" }),
        /permission denied/,
    );
    assert.match(
        fraudCheckErrorMessage({
            name: "TimeoutError",
            message: "PRIVATE_CONTENT",
        }),
        /timed out/,
    );
});
