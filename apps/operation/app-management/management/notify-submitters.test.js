const assert = require("node:assert/strict");
const test = require("node:test");
const { notify, parseNotification } = require("./notify-submitters.js");

const APP = {
    issueUrl: "https://github.com/pollinations/pollinations/issues/123",
    name: "Sunflower Studio",
    reason: "The app returned HTTP 404 twice",
};

function marker(action, apps = [APP]) {
    return `<!-- pollinations-app-management:${Buffer.from(
        JSON.stringify({ action, apps }),
    ).toString("base64")} -->`;
}

test("parses the machine-readable PR marker", () => {
    assert.deepEqual(parseNotification(marker("remove")), {
        action: "remove",
        apps: [APP],
    });
    assert.equal(parseNotification("ordinary PR"), null);
});

test("notifies the original submission issue after merge", async () => {
    const requests = [];
    const event = {
        pull_request: {
            body: marker("remove"),
            html_url: "https://github.com/pollinations/pollinations/pull/456",
            merged: true,
        },
        repository: { full_name: "pollinations/pollinations" },
    };
    const count = await notify(event, "token", async (url, options) => {
        requests.push({ options, url });
        return { ok: true };
    });

    assert.equal(count, 1);
    assert.equal(
        requests[0].url,
        "https://api.github.com/repos/pollinations/pollinations/issues/123/comments",
    );
    assert.match(
        JSON.parse(requests[0].options.body).body,
        /removed from the community app catalog/,
    );
});
