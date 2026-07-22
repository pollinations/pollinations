const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildRow,
    inferPlatform,
    parseSubmission,
    validateSubmission,
} = require("./lib/app-submission.js");

const BODY = `### App Name
Sunflower Studio

### App Description
Creates images with the Pollinations API for collaborative design work.

### App URL
https://example.com/app

### GitHub Repository URL
https://github.com/example/sunflower

### App Category
image

### App Language
en

### Discord Username
sunflower`;

test("parses and validates the issue form", () => {
    const submission = parseSubmission(BODY);
    assert.equal(submission.name, "Sunflower Studio");
    assert.equal(submission.appUrl, "https://example.com/app");
    assert.equal(submission.category, "image");
    assert.deepEqual(validateSubmission(submission), []);
});

test("infers known distribution platforms", () => {
    assert.equal(
        inferPlatform("Example", "https://play.google.com/store/apps/x", ""),
        "android",
    );
    assert.equal(inferPlatform("Example CLI", "", "command-line tool"), "cli");
});

test("builds the canonical APPS.md row", () => {
    const row = buildRow(parseSubmission(BODY), {
        githubUsername: "example",
        githubUserId: 123,
        submittedDate: "2026-07-01",
        issueUrl: "https://github.com/pollinations/pollinations/issues/1",
        approvedDate: "2026-07-02",
    });
    assert.equal(row.split("|").length - 1, 19);
    assert.match(row, /@example \| 123/);
});
