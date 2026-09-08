const assert = require("node:assert/strict");
const test = require("node:test");
const { keepalive } = require("./keepalive-screenshots.js");

test("refreshes each unique screenshot with a cache-busting GET", async () => {
    const requests = [];
    const responses = [];
    const apps = [
        { screenshotUrl: "https://media.pollinations.ai/one" },
        { screenshotUrl: "https://media.pollinations.ai/one" },
        { screenshotUrl: "https://media.pollinations.ai/two" },
        { screenshotUrl: null },
    ];

    const count = await keepalive(
        apps,
        async (url, options) => {
            requests.push({ url: url.href, options });
            const response = new Response("image", { status: 200 });
            responses.push(response);
            return response;
        },
        "weekly-run",
    );

    assert.equal(count, 2);
    assert.deepEqual(requests.map(({ url }) => url).sort(), [
        "https://media.pollinations.ai/one?keepalive=weekly-run",
        "https://media.pollinations.ai/two?keepalive=weekly-run",
    ]);
    for (const { options } of requests) {
        assert.equal(options.cache, "no-store");
        assert.equal(options.headers["Cache-Control"], "no-cache");
    }
    assert.ok(responses.every((response) => response.bodyUsed));
});

test("reports every unavailable screenshot", async () => {
    const apps = [
        { screenshotUrl: "https://media.pollinations.ai/missing" },
        { screenshotUrl: "https://media.pollinations.ai/broken" },
    ];

    await assert.rejects(
        keepalive(apps, async (url) => {
            if (url.pathname === "/missing") {
                return new Response("not found", { status: 404 });
            }
            throw new Error("connection failed");
        }),
        /Failed to refresh 2 of 2 screenshot\(s\)/,
    );
});
