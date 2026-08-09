const assert = require("node:assert/strict");
const test = require("node:test");
const { renderPrBody } = require("./render-pr-body.js");

test("renders catalog changes, removals, unresolved evidence, and notification marker", () => {
    const body = renderPrBody(
        {
            removedApps: [
                {
                    issueUrl:
                        "https://github.com/pollinations/pollinations/issues/1",
                    name: "Dead app",
                    reason: "HTTP 404 twice",
                    url: "https://dead.test",
                },
            ],
            results: [
                { name: "Updated app", outcome: "approved" },
                { name: "Dead app", outcome: "confirmed_removal" },
                {
                    name: "Upload failed",
                    outcome: "upload_failed",
                    uploadError: "Media returned HTTP 503",
                },
                {
                    evidenceUrl: "https://media.pollinations.ai/rejected.png",
                    name: "Needs | review",
                    outcome: "agent_rejected",
                    review: { reason: "Overlay remained" },
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

    assert.match(body, /1 catalog rows updated, 1 removed, 2 unresolved/);
    assert.match(body, /\| Updated app \| name \| Old name \| Updated app \|/);
    assert.match(body, /Needs &#124; review/);
    assert.match(body, /Media returned HTTP 503/);
    assert.match(body, /!\[Rejected terminal screen\]/);
    const encoded = body.match(
        /<!-- pollinations-app-management:([^ ]+) -->/,
    )[1];
    assert.deepEqual(JSON.parse(Buffer.from(encoded, "base64")), {
        action: "remove",
        apps: [
            {
                issueUrl:
                    "https://github.com/pollinations/pollinations/issues/1",
                name: "Dead app",
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
                    outcome: "agent_rejected",
                },
            ],
        },
        "https://github.com/example/actions/runs/1",
    );
    assert.doesNotMatch(body, /!\[Rejected terminal screen\]/);
});
