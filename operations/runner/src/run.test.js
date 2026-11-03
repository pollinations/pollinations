import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { readUrls } from "./agent.js";
import { repoFact } from "./facts/app-submission.js";
import { verifySignature } from "./github.js";
import { RETRY_MS, receive, work } from "./jobs.js";
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

test("an edit, an approval or closing during the run stops the writes", async () => {
    for (const now of [
        { ...issue, body: "edited" },
        { ...issue, labels: [{ name: "APP-APPROVED" }] },
        { ...issue, state: "closed" },
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

test("a report that confirms nothing is incomplete, never ready", async () => {
    const github = fakeGithub();
    const result = await run({
        route: withFacts({ context: {}, ids: new Set(["F1"]) }),
        issue,
        github,
        write: true,
        // Claims citing nothing the agent had become unverified.
        ask: answer(
            route.requirements.map((requirement) => ({
                ...supported(requirement),
                evidence: ["https://never-read.example"],
            })),
        ),
        log: quiet,
    });
    assert.equal(result.outcome.kind, "incomplete");
    assert.equal(result.label, "APP-REVIEW");
    assert.match(github.writes[0].comment, /not enough could be checked/);
    assert.doesNotMatch(github.writes[0].comment, /ready for human review/);
});

test("a failed attempt with retries left writes nothing", async () => {
    const github = fakeGithub();
    const result = await run({
        route: withFacts({ context: {}, ids: new Set() }),
        issue,
        github,
        write: true,
        lastAttempt: false,
        ask: async () => {
            throw new Error("gen down");
        },
        log: quiet,
    });
    assert.equal(result.retry, true);
    assert.equal(github.writes.length, 0);
});

test("a route writes only the actions it is allowed", async () => {
    const github = fakeGithub();
    await run({
        route: { ...withFacts({ stop: ["x"] }), actions: ["comment"] },
        issue,
        github,
        write: true,
        log: quiet,
    });
    assert.deepEqual(
        github.writes.map((w) => Object.keys(w)[0]),
        ["comment"],
    );
});

test("readUrls keeps only pages a tool call actually returned", () => {
    const call = (id, urls) => ({
        type: "function_call",
        call_id: id,
        arguments: JSON.stringify({ urls }),
    });
    const result = (id, text) => ({
        type: "function_call_output",
        call_id: id,
        output: [{ type: "input_text", text }],
    });
    const output = [
        call("a", ["https://app.example/", "https://down.example"]),
        result(
            "a",
            "URL: https://app.example\nCould not fetch https://down.example: CRAWL_ERROR",
        ),
        call("b", ["https://no-result.example"]),
    ];
    assert.deepEqual(readUrls(output), ["https://app.example/"]);
});

// A Durable Object storage stand-in: values plus the one pending alarm.
function fakeStorage() {
    const values = new Map();
    return {
        values,
        alarm: null,
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, value),
        delete: async (key) => values.delete(key),
        async setAlarm(at) {
            this.alarm = at;
        },
    };
}
const job = (delivery, body = "form") => ({
    delivery,
    routeId: route.id,
    repo: "pollinations/pollinations",
    issue: { ...issue, body },
});
const ran = (kind, extra = {}) => ({ outcome: { kind }, ...extra });

test("a stored job runs once per body and skips redeliveries", async () => {
    const storage = fakeStorage();
    let calls = 0;
    const execute = async () => {
        calls++;
        return ran("report");
    };
    assert.equal(await receive(storage, job("d1")), true);
    assert.ok(storage.alarm > Date.now());
    await work(storage, execute);
    assert.equal(calls, 1);
    assert.equal(storage.values.has("job"), false);
    assert.equal(await receive(storage, job("d1")), false);
    await receive(storage, job("d2"));
    await work(storage, execute);
    assert.equal(calls, 1, "an unchanged body costs no agent call");
    await receive(storage, job("d3", "edited form"));
    await work(storage, execute);
    assert.equal(calls, 2);
});

test("a failed agent call is retried, then the last attempt reports", async () => {
    const storage = fakeStorage();
    const attempts = [];
    const execute = async (_job, { lastAttempt }) => {
        attempts.push(lastAttempt);
        return lastAttempt
            ? ran("unavailable")
            : ran("unavailable", { retry: true });
    };
    await receive(storage, job("d1"));
    for (let i = 0; i <= RETRY_MS.length; i++) await work(storage, execute);
    assert.deepEqual(attempts, [false, false, true]);
    assert.equal(storage.values.has("done"), false, "unavailable is not done");
    assert.equal(storage.values.has("job"), false);
});

test("an event during a run keeps the newer job", async () => {
    const storage = fakeStorage();
    await receive(storage, job("d1"));
    await work(storage, async (_job, { isLatest }) => {
        await receive(storage, job("d2", "edited form"));
        assert.equal(await isLatest(), false);
        return ran("report", { skipped: true });
    });
    assert.equal(storage.values.get("job").delivery, "d2");
    assert.equal(storage.values.has("done"), false);
});

test("matchRoute wakes Community app only for open submission issues", () => {
    const repo = "pollinations/pollinations";
    const payload = (overrides, fullName = repo) => ({
        action: "opened",
        repository: { full_name: fullName },
        issue: { ...issue, ...overrides },
    });
    assert.equal(
        matchRoute("issues", payload({}), repo)?.id,
        "community-apps/review",
    );
    assert.equal(
        matchRoute(
            "issues",
            payload({ labels: [], title: "[App Submission]" }),
            repo,
        )?.id,
        "community-apps/review",
    );
    assert.equal(
        matchRoute("issues", payload({ labels: [], title: "Bug" }), repo),
        null,
    );
    assert.equal(
        matchRoute(
            "issues",
            payload({ labels: [{ name: "APP-APPROVED" }] }),
            repo,
        ),
        null,
    );
    assert.equal(
        matchRoute("issues", payload({ pull_request: {} }), repo),
        null,
    );
    assert.equal(
        matchRoute("issues", payload({ state: "closed" }), repo),
        null,
    );
    assert.equal(matchRoute("issue_comment", payload({}), repo), null);
});

test("matchRoute ignores events from any other repository", () => {
    const payload = {
        action: "opened",
        repository: { full_name: "pollinations/security-triage" },
        issue,
    };
    assert.equal(
        matchRoute("issues", payload, "pollinations/pollinations"),
        null,
    );
});

test("repoFact reads only public repositories", async () => {
    let n = 0;
    const github = {
        repo: async () => ({ private: true, default_branch: "main" }),
        tree: () => assert.fail("read a private repository"),
    };
    const fact = await repoFact(
        "https://github.com/pollinations/security-triage",
        github,
        () => `F${++n}`,
    );
    assert.equal(fact.error, "not a public repository");
    assert.equal(fact.files, undefined);
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
