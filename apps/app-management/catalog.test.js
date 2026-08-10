const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    prependApp,
    readApps,
    validateApps,
    writeApps,
} = require("./catalog.js");

const APP = {
    emoji: "🌻",
    name: "Sunflower Studio",
    url: "https://example.com",
    description: "Creates images with the Pollinations API.",
    language: "en",
    category: "image",
    platform: "web",
    githubUsername: "example",
    githubUserId: "123",
    repositoryUrl: "https://github.com/example/sunflower",
    repositoryStars: 12,
    discordUsername: null,
    other: null,
    submittedDate: "2026-07-01",
    issueUrl: "https://github.com/pollinations/pollinations/issues/1",
    approvedDate: "2026-07-02",
    byop: false,
    requests24h: 0,
};

test("validates and round-trips catalog apps", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-catalog-"));
    const filePath = path.join(directory, "catalog.json");

    writeApps([APP], filePath);
    assert.deepEqual(readApps(filePath), [APP]);

    fs.rmSync(directory, { recursive: true, force: true });
});

test("prepends a validated catalog app", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-catalog-"));
    const filePath = path.join(directory, "catalog.json");

    writeApps([APP], filePath);
    const first = { ...APP, name: "First App" };
    prependApp(first, filePath);
    assert.deepEqual(readApps(filePath), [first, APP]);

    fs.rmSync(directory, { recursive: true, force: true });
});

test("accepts an optional screenshot URL", () => {
    assert.deepEqual(validateApps([{ ...APP, screenshotUrl: null }]), [
        { ...APP, screenshotUrl: null },
    ]);
    assert.deepEqual(
        validateApps([
            {
                ...APP,
                screenshotUrl: "https://media.pollinations.ai/example",
            },
        ]),
        [
            {
                ...APP,
                screenshotUrl: "https://media.pollinations.ai/example",
            },
        ],
    );
    assert.throws(
        () => validateApps([{ ...APP, screenshotUrl: 42 }]),
        /screenshotUrl must be null or a non-empty string/,
    );
    assert.throws(
        () =>
            validateApps([
                { ...APP, screenshotUrl: "https://example.com/screenshot" },
            ]),
        /screenshotUrl must use https:\/\/media\.pollinations\.ai\//,
    );
    assert.throws(
        () =>
            validateApps([
                {
                    ...APP,
                    screenshotUrl: "https://media.pollinations.ai/example ",
                },
            ]),
        /screenshotUrl must use https:\/\/media\.pollinations\.ai\//,
    );
    assert.throws(
        () =>
            validateApps([
                { ...APP, screenshotUrl: "https://media.pollinations.ai/" },
            ]),
        /screenshotUrl must use https:\/\/media\.pollinations\.ai\//,
    );
});

test("rejects missing and wrong-typed fields", () => {
    assert.throws(
        () => validateApps([{ ...APP, name: "" }]),
        /name must be a non-empty string/,
    );
    assert.throws(
        () => validateApps([{ ...APP, byop: "false" }]),
        /byop must be a boolean/,
    );
    assert.throws(
        () => validateApps([{ ...APP, screenshot: "typo" }]),
        /screenshot is not a catalog field/,
    );
});
