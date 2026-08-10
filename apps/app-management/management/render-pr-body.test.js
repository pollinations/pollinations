const assert = require("node:assert/strict");
const test = require("node:test");
const { renderPrBody } = require("./render-pr-body.js");

test("renders catalog changes, removals, unresolved evidence, and notification marker", () => {
    const body = renderPrBody(
        {
            removedApps: [
                {
                    confirmationReason: "HTTP 404 twice",
                    issueUrl:
                        "https://github.com/pollinations/pollinations/issues/1",
                    name: "Dead app",
                    proposalReason: "The live app is gone",
                    reason: "HTTP 404 twice",
                    url: "https://dead.test",
                },
            ],
            results: [
                { name: "Updated app", outcome: "keep" },
                { name: "Dead app", outcome: "remove" },
                {
                    name: "Upload failed",
                    outcome: "retry",
                    retryKind: "upload",
                    uploadError: "Media returned HTTP 503",
                },
                {
                    evidenceUrl: "https://media.pollinations.ai/rejected.png",
                    name: "Needs | review",
                    outcome: "retry",
                    retryKind: "ui",
                    review: {
                        confirmation: {
                            reason: "The destination may be temporary.",
                        },
                        proposal: { reason: "The destination looks parked." },
                        reason: "Removal was not confirmed.",
                    },
                },
            ],
            updatedApps: [
                {
                    changes: [
                        {
                            field: "name",
                            from: "Old name",
                            reason: "The accepted screen proves the name.",
                            to: "Updated app",
                        },
                    ],
                    name: "Updated app",
                },
            ],
        },
        "https://github.com/pollinations/pollinations/actions/runs/1",
    );

    assert.match(body, /1 kept, 1 removed, 2 queued for retry/);
    assert.match(body, /\| Updated app \| name \| Old name \| Updated app \|/);
    assert.match(body, /The live app is gone/);
    assert.match(body, /Needs &#124; review/);
    assert.match(body, /Media returned HTTP 503/);
    assert.match(body, /Proposed removal: The destination looks parked/);
    assert.match(body, /Independent review: The destination may be temporary/);
    assert.match(body, /!\[Retry evidence\]/);
    const encoded = body.match(
        /<!-- pollinations-app-management:([^ ]+) -->/,
    )[1];
    assert.deepEqual(JSON.parse(Buffer.from(encoded, "base64")), {
        action: "remove",
        apps: [
            {
                confirmationReason: "HTTP 404 twice",
                issueUrl:
                    "https://github.com/pollinations/pollinations/issues/1",
                name: "Dead app",
                proposalReason: "The live app is gone",
                reason: "HTTP 404 twice",
                url: "https://dead.test",
            },
        ],
    });
});

test("does not embed untrusted evidence URLs", () => {
    const body = renderPrBody(
        {
            results: [
                {
                    evidenceUrl: "https://other.test/private.png",
                    name: "Private",
                    outcome: "retry",
                },
            ],
        },
        "https://github.com/example/actions/runs/1",
    );
    assert.doesNotMatch(body, /!\[Rejected terminal screen\]/);
});
