const assert = require("node:assert/strict");
const test = require("node:test");
const { screenshotFailureMessage } = require("./validate-submission.js");

// The submitter only ever sees this string, so a size or format rejection has to
// say what is wrong instead of telling them to upload the same file again.
test("passes through the size rejection with its measured size", () => {
    assert.equal(
        screenshotFailureMessage(
            new Error(
                "Screenshot is 6.0 MB; it must be PNG, JPEG, or WebP, at most 5 MB",
            ),
        ),
        "Screenshot is 6.0 MB; it must be PNG, JPEG, or WebP, at most 5 MB.",
    );
});

test("passes through the streaming-cap rejection", () => {
    assert.equal(
        screenshotFailureMessage(
            new Error(
                "Screenshot is larger than PNG, JPEG, or WebP, at most 5 MB; refusing to buffer it",
            ),
        ),
        "Screenshot is larger than PNG, JPEG, or WebP, at most 5 MB; refusing to buffer it.",
    );
});

test("keeps the generic message for real download failures", () => {
    for (const message of [
        "Screenshot download returned HTTP 404",
        "The operation was aborted due to timeout",
        "fetch failed",
    ]) {
        assert.equal(
            screenshotFailureMessage(new Error(message)),
            "Screenshot could not be downloaded; upload it again in the Screenshot field.",
        );
    }
});

test("survives a rejection that carries no message", () => {
    assert.equal(
        screenshotFailureMessage(undefined),
        "Screenshot could not be downloaded; upload it again in the Screenshot field.",
    );
    assert.equal(
        screenshotFailureMessage(new Error("")),
        "Screenshot could not be downloaded; upload it again in the Screenshot field.",
    );
});

test("requiring the module does not run the CLI", () => {
    // If main() ran on import it would throw on the missing ISSUE_NUMBER and set
    // a non-zero exitCode; reaching this assertion proves the guard holds.
    assert.equal(typeof screenshotFailureMessage, "function");
    assert.notEqual(process.exitCode, 1);
});
