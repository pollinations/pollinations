import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifySignature } from "./github.js";
import { matchRoute, ROUTES } from "./routes.js";
import { run } from "./run.js";

const route = ROUTES[0];
const issue = {
    number: 7,
    body: "form",
    state: "open",
    title: "[App Submission] Thing",
    labels: [{ name: "APP-SUBMISSION" }],
    user: { login: "alice" },
};

// A GitHub stand-in that records writes; `now` is the issue as GitHub sees it
// when the run is about to write.
function fakeGithub(now = issue) {
    const writes = [];
    return {
        writes,
        issue: async () => now,
        upsertComment: async (_number, _marker, body) =>
            writes.push({ comment: body }),
        setStatusLabel: async (_number, _owned, add) =>
            writes.push({ labels: add.filter(Boolean) }),
    };
}

const withFacts = (facts) => ({ ...route, facts: async () => facts });
const supported = (requirement) => ({
    requirement,
    status: "supported",
    evidence: ["F1"],
    note: "Seen.",
});
const answer =
    (findings, questions = []) =>
    async () => ({
        text: JSON.stringify({ findings, questions }),
        fetched: [],
    });
const quiet = () => {};

test("an invalid form posts its errors and never calls the agent", async () => {
    const github = fakeGithub();
    const result = await run({
        route: withFacts({ stop: ["App Name is required."] }),
        issue,
        github,
        write: true,
        ask: () => assert.fail("agent called"),
        log: quiet,
    });
    assert.equal(result.label, "APP-NEEDS-INFO");
    assert.match(github.writes[0].comment, /- App Name is required\./);
    assert.deepEqual(github.writes[1].labels, [
        "APP-SUBMISSION",
        "APP-NEEDS-INFO",
    ]);
});

test("a contradicted check asks its question and labels needs-info", async () => {
    const github = fakeGithub();
    const result = await run({
        route: withFacts({ context: {}, ids: new Set(["F1"]) }),
        issue,
        github,
        write: true,
        ask: answer(
            [
                supported("works"),
                {
                    requirement: "sign_in",
                    status: "contradicted",
                    evidence: ["F1"],
                    note: "Device page.",
                },
            ],
            ["Use the redirect flow."],
        ),
        log: quiet,
    });
    assert.equal(result.label, "APP-NEEDS-INFO");
    assert.match(github.writes[0].comment, /^<!-- APP_PRE_REVIEW -->/);
    assert.match(github.writes[0].comment, /- Use the redirect flow\./);
    assert.match(
        github.writes[0].comment,
        /\| Sign-in returns to the app \| ❌ contradicted \| Device page\. \|/,
    );
});

test("silent mode logs the comment and writes nothing", async () => {
    const github = fakeGithub();
    const logs = [];
    const result = await run({
        route: withFacts({ context: {}, ids: new Set(["F1"]) }),
        issue,
        github,
        write: false,
        ask: answer(route.requirements.map(supported)),
        log: (line) => logs.push(line),
    });
    assert.equal(result.label, "APP-REVIEW");
    assert.equal(github.writes.length, 0);
    assert.match(logs[0], /ready for human review/);
});

test("an edit or an approval during the run stops the writes", async () => {
    for (const now of [
        { ...issue, body: "edited" },
        { ...issue, labels: [{ name: "APP-APPROVED" }] },
    ]) {
        const github = fakeGithub(now);
        const result = await run({
            route: withFacts({ stop: ["x"] }),
            issue,
            github,
            write: true,
            log: quiet,
        });
        assert.equal(result.skipped, true);
        assert.equal(github.writes.length, 0);
    }
});

test("a failed run says the check is unavailable and sets no status", async () => {
    const github = fakeGithub();
    const result = await run({
        route: withFacts({ context: {}, ids: new Set() }),
        issue,
        github,
        write: true,
        ask: async () => {
            throw new Error("gen down");
        },
        log: quiet,
    });
    assert.equal(result.outcome.kind, "unavailable");
    assert.match(github.writes[0].comment, /App pre-review unavailable/);
    assert.deepEqual(github.writes[1].labels, ["APP-SUBMISSION"]);
});

test("matchRoute wakes Community app only for open submission issues", () => {
    const payload = (overrides) => ({
        action: "opened",
        issue: { ...issue, ...overrides },
    });
    assert.equal(matchRoute("issues", payload({}))?.id, "community-app/review");
    assert.equal(
        matchRoute("issues", payload({ labels: [], title: "[App Submission]" }))
            ?.id,
        "community-app/review",
    );
    assert.equal(
        matchRoute("issues", payload({ labels: [], title: "Bug" })),
        null,
    );
    assert.equal(
        matchRoute("issues", payload({ labels: [{ name: "APP-APPROVED" }] })),
        null,
    );
    assert.equal(matchRoute("issues", payload({ pull_request: {} })), null);
    assert.equal(matchRoute("issue_comment", payload({})), null);
});

test("verifySignature accepts GitHub's signature and nothing else", async () => {
    const body = '{"action":"opened"}';
    const good = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    assert.equal(await verifySignature("s3cret", body, good), true);
    assert.equal(await verifySignature("other", body, good), false);
    assert.equal(await verifySignature("s3cret", `${body} `, good), false);
    assert.equal(await verifySignature("s3cret", body, "sha256=zz"), false);
    assert.equal(await verifySignature("", body, good), false);
});
