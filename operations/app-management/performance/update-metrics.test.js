const assert = require("node:assert/strict");
const test = require("node:test");
const { byopLookup } = require("./update-metrics.js");

const ONE_LINE_ARENA = {
    url: "https://drjacky.github.io/one-line-arena",
    githubUserId: "2296754",
};
const POLLICRAFT = {
    url: "https://drjacky.github.io/PolliCraft",
    githubUserId: "2296754",
};

test("credits App Key traffic only to the listing it was matched to", () => {
    const row = {
        app_url: ONE_LINE_ARENA.url,
        hostname: "",
        github_user_id: "2296754",
    };
    const requests = byopLookup([row], [{ ...row, requests: 7 }]);

    assert.equal(requests(ONE_LINE_ARENA), 7);
    assert.equal(requests(POLLICRAFT), null);
    assert.equal(requests({ ...ONE_LINE_ARENA, githubUserId: "1" }), null);
});

test("adds traffic from keys without an App Key by hostname", () => {
    const appKeyRow = {
        app_url: ONE_LINE_ARENA.url,
        hostname: "",
        github_user_id: "2296754",
    };
    const hostnameRow = {
        app_url: "",
        hostname: "drjacky.github.io",
        github_user_id: "",
    };
    const requests = byopLookup(
        [appKeyRow, hostnameRow],
        [
            { ...appKeyRow, requests: 7 },
            { ...hostnameRow, requests: 2 },
        ],
    );

    assert.equal(requests(ONE_LINE_ARENA), 9);
    assert.equal(requests(POLLICRAFT), 2);
});
