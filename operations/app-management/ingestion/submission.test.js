const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    buildApp,
    inferPlatform,
    parseSubmission,
    validateSubmission,
} = require("./submission.js");

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

test("preserves multiline textarea content", () => {
    const submission = parseSubmission(
        BODY.replace(
            "Creates images with the Pollinations API for collaborative design work.",
            "Creates images\nwith the Pollinations API for collaborative design work.",
        ),
    );
    assert.equal(
        submission.description,
        "Creates images with the Pollinations API for collaborative design work.",
    );
    assert.deepEqual(validateSubmission(submission), []);
});

test("parses the optional quest reference", () => {
    const withQuest = (value) =>
        parseSubmission(`${BODY}\n\n### Quest\n${value}`);
    assert.equal(withQuest("#15600").quest, "15600");
    assert.equal(withQuest("15600").quest, "15600");
    assert.equal(withQuest("_No response_").quest, "");
    assert.deepEqual(validateSubmission(withQuest("the Krita one")), [
        "Quest must be a quest issue number such as #15600.",
    ]);
});

test("infers known distribution platforms", () => {
    assert.equal(
        inferPlatform("Example", "https://play.google.com/store/apps/x", ""),
        "android",
    );
    assert.equal(inferPlatform("Example CLI", "", "command-line tool"), "cli");
});

test("builds the canonical catalog app", () => {
    const app = buildApp(parseSubmission(BODY), {
        githubUsername: "example",
        githubUserId: 123,
        submittedDate: "2026-07-01",
        issueUrl: "https://github.com/pollinations/pollinations/issues/1",
        approvedDate: "2026-07-02",
    });
    assert.equal(app.githubUsername, "example");
    assert.equal(app.githubUserId, "123");
    assert.equal(app.repositoryStars, null);
    assert.equal(app.byop, false);
    assert.equal(app.requests24h, 0);
});

test("publisher validation uses the approval snapshot and tolerates deleted users", () => {
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "app-validator-"));
    const fakeGh = path.join(fakeBin, "gh");
    const otherBody = BODY.replace("Sunflower Studio", "Different App")
        .replace("https://example.com/app", "https://different.example/app")
        .replace(
            "https://github.com/example/sunflower",
            "https://github.com/example/different",
        );
    fs.writeFileSync(
        fakeGh,
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "issue" && args[1] === "view") process.exit(90);
if (args[0] === "issue" && args[1] === "list") {
    console.log(${JSON.stringify(JSON.stringify([{ number: 2, body: otherBody, url: "https://github.com/pollinations/pollinations/issues/2", author: null }]))});
} else if (args[0] === "api") {
    console.log('{"id":123}');
} else {
    process.exit(91);
}
`,
        { mode: 0o755 },
    );

    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "validate-submission.js")],
        {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${fakeBin}:${process.env.PATH}`,
                ISSUE_NUMBER: "1",
                ISSUE_AUTHOR: "example",
                ISSUE_BODY: BODY,
                ISSUE_CREATED_AT: "2026-07-01T00:00:00Z",
                ISSUE_URL:
                    "https://github.com/pollinations/pollinations/issues/1",
                APPROVED_DATE: "2026-07-02",
            },
        },
    );
    fs.rmSync(fakeBin, { recursive: true, force: true });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.endsWith("\n"));
    const output = JSON.parse(result.stdout);
    assert.equal(output.submission.name, "Sunflower Studio");
    assert.deepEqual(output.app, {
        emoji: "🖼️",
        name: "Sunflower Studio",
        url: "https://example.com/app",
        description:
            "Creates images with the Pollinations API for collaborative design work.",
        language: "en",
        category: "image",
        platform: "web",
        githubUsername: "example",
        githubUserId: "123",
        repositoryUrl: "https://github.com/example/sunflower",
        repositoryStars: null,
        discordUsername: "sunflower",
        other: null,
        submittedDate: "2026-07-01",
        issueUrl: "https://github.com/pollinations/pollinations/issues/1",
        approvedDate: "2026-07-02",
        byop: false,
        requests24h: 0,
    });
});

test("a named quest must be an open POLLEN-QUEST issue", () => {
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "app-validator-"));
    fs.writeFileSync(
        path.join(fakeBin, "gh"),
        `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "issue" && args[1] === "view") {
    console.log(JSON.stringify({ state: process.env.QUEST_STATE, labels: [{ name: "POLLEN-QUEST" }] }));
} else if (args[0] === "issue" && args[1] === "list") {
    console.log("[]");
} else if (args[0] === "api") {
    console.log('{"id":123}');
} else {
    process.exit(91);
}
`,
        { mode: 0o755 },
    );
    const validate = (questState) =>
        spawnSync(
            process.execPath,
            [path.join(__dirname, "validate-submission.js")],
            {
                encoding: "utf8",
                env: {
                    ...process.env,
                    PATH: `${fakeBin}:${process.env.PATH}`,
                    QUEST_STATE: questState,
                    ISSUE_NUMBER: "1",
                    ISSUE_AUTHOR: "example",
                    ISSUE_BODY: `${BODY}\n\n### Quest\n#15600`,
                    ISSUE_CREATED_AT: "2026-07-01T00:00:00Z",
                    ISSUE_URL:
                        "https://github.com/pollinations/pollinations/issues/1",
                },
            },
        );
    const open = validate("OPEN");
    const closed = validate("CLOSED");
    fs.rmSync(fakeBin, { recursive: true, force: true });

    assert.equal(open.status, 0, open.stderr || open.stdout);
    assert.equal(JSON.parse(open.stdout).submission.quest, "15600");
    assert.equal(closed.status, 2, closed.stderr || closed.stdout);
    assert.deepEqual(JSON.parse(closed.stdout).errors, [
        "Quest #15600 is not an open POLLEN-QUEST issue. Enter an open quest or leave the Quest field empty.",
    ]);
});
