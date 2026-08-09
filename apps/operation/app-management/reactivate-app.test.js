const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    applyCandidate,
    isAuthorizedReactivationEvent,
    isPublicAppUrl,
    prepareCandidate,
    recoverApp,
    validateReactivationDecision,
} = require("./reactivate-app.js");

const APP = {
    emoji: "🌻",
    name: "Sunflower Studio",
    url: "https://sunflower.test",
    description: "Creates images with Pollinations.",
    language: "en",
    category: "image",
    platform: "web",
    githubUsername: "gardener",
    githubUserId: "123",
    repositoryUrl: "https://github.com/gardener/sunflower",
    repositoryStars: 4,
    discordUsername: null,
    other: null,
    submittedDate: "2026-07-01",
    issueUrl: "https://github.com/pollinations/pollinations/issues/123",
    approvedDate: "2026-07-02",
    byop: false,
    requests24h: 0,
    screenshotUrl: "https://media.pollinations.ai/old.webp",
};

function event(overrides = {}) {
    return {
        comment: {
            author_association: "NONE",
            body: "It is fixed now.",
            user: { login: "gardener", type: "User" },
        },
        issue: {
            html_url: APP.issueUrl,
            labels: [{ name: "APP-SUBMISSION" }],
            user: { login: "gardener" },
        },
        ...overrides,
    };
}

test("accepts the submitter or a repository maintainer", () => {
    assert.equal(isAuthorizedReactivationEvent(event()), true);
    assert.equal(
        isAuthorizedReactivationEvent(
            event({
                comment: {
                    author_association: "MEMBER",
                    body: "The app works again.",
                    user: { login: "maintainer", type: "User" },
                },
            }),
        ),
        true,
    );
    assert.equal(
        isAuthorizedReactivationEvent(
            event({
                comment: {
                    author_association: "NONE",
                    body: "Restore it.",
                    user: { login: "stranger", type: "User" },
                },
            }),
        ),
        false,
    );
});

test("rejects repository links as replacement app URLs", () => {
    assert.deepEqual(
        validateReactivationDecision({
            decision: "restore",
            reason: "Use the repository.",
            url: "https://github.com/gardener/sunflower",
        }),
        {
            decision: "ignore",
            reason: "A repository is not a replacement for a working app",
            url: null,
        },
    );
});

test("rejects private replacement targets", () => {
    assert.equal(isPublicAppUrl("https://app.test"), true);
    assert.equal(isPublicAppUrl("http://127.0.0.1"), false);
    assert.equal(isPublicAppUrl("http://169.254.169.254/latest"), false);
    assert.equal(isPublicAppUrl("http://10.0.0.4"), false);
    assert.equal(isPublicAppUrl("http://[::1]"), false);
    assert.equal(isPublicAppUrl("https://user:pass@app.test"), false);
});

test("prepares a recovered app with a fresh screenshot slot", async () => {
    const candidate = await prepareCandidate(
        event(),
        [],
        "unused-token",
        "unused-model",
        () => APP,
        async () => ({
            decision: "restore",
            reason: "The submitter says it is fixed.",
            url: "https://new.sunflower.test",
        }),
    );

    assert.equal(candidate.url, "https://new.sunflower.test");
    assert.equal(candidate.screenshotUrl, null);
});

test("recovers a deleted row from catalog git history", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-history-"));
    fs.mkdirSync(path.join(directory, "apps"));
    execFileSync("git", ["init"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
        cwd: directory,
    });
    const catalogFile = path.join(directory, "apps/catalog.json");
    fs.writeFileSync(catalogFile, `${JSON.stringify([APP], null, 2)}\n`);
    execFileSync("git", ["add", "apps/catalog.json"], { cwd: directory });
    execFileSync("git", ["commit", "-m", "add app"], { cwd: directory });
    fs.writeFileSync(catalogFile, "[]\n");
    execFileSync("git", ["commit", "-am", "remove app"], { cwd: directory });

    assert.deepEqual(recoverApp(APP.issueUrl, directory), APP);
    fs.rmSync(directory, { force: true, recursive: true });
});

test("applies a candidate once", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-restore-"));
    const catalogFile = path.join(directory, "catalog.json");
    fs.writeFileSync(catalogFile, "[]\n");

    assert.equal(applyCandidate(APP, catalogFile), true);
    assert.equal(applyCandidate(APP, catalogFile), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(catalogFile, "utf8")), [APP]);
    fs.rmSync(directory, { force: true, recursive: true });
});
