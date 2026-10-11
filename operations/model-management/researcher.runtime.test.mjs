import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main, parentIssue, publish } from "./researcher.mjs";

const inference = {
    name: "openai/gpt-6.1-sol",
    community: false,
    paid_only: false,
    category: "text",
    pricing: { promptTextTokens: 0.000002, completionTextTokens: 0.00001 },
};
const model = {
    name: "publisher/runtime-v1",
    aliases: ["runtime"],
    category: "text",
    community: false,
};
const inventory = [model, inference];
const artifact =
    "https://github.com/pollinations/pollinations/actions/runs/123/artifacts/456";
const marker = "<!-- model-research-run:123 -->";
const envFor = (out) => ({
    POLLINATIONS_API_KEY: "test-runtime-key",
    MODELS: model.name,
    MAX_POLLEN: "1",
    RESEARCH_OUT: out,
});
const issueEnv = (out) => ({
    RESEARCH_OUT: out,
    GITHUB_TOKEN: "test-github-key",
    GITHUB_REPOSITORY: "pollinations/pollinations",
    GITHUB_RUN_ID: "123",
    RESEARCH_ARTIFACT_URL: artifact,
});
const partial = () => ({
    startedAt: "2026-10-11T00:00:00Z",
    completedAt: "2026-10-11T01:00:00Z",
    status: "partial",
    officialCount: 2,
    selectedCount: 1,
    models: [
        {
            name: model.name,
            status: "researched",
            gaps: ["Account access unknown"],
        },
    ],
    discovery: { status: "blocked" },
    catalogDigest: "a".repeat(64),
    sha: "b".repeat(40),
});
async function output(t, report) {
    const out = await mkdtemp(join(tmpdir(), "model-runtime-"));
    if (report)
        await writeFile(join(out, "research.json"), JSON.stringify(report));
    const exit = process.exitCode;
    t.after(() => {
        process.exitCode = exit;
    });
    return out;
}
function catalog(url) {
    if (url.includes("/models?")) return Response.json(inventory);
    if (url.endsWith("/mcp"))
        return Response.json({
            data: [
                {
                    id: "exa",
                    pricing: {
                        rates: [
                            { kind: "search_request", price: 0.007 },
                            { kind: "page", price: 0.001 },
                        ],
                    },
                },
            ],
        });
}
const noAction = (
    usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
) =>
    Response.json({
        usage,
        choices: [
            {
                message: {
                    role: "assistant",
                    content: "No usable research action",
                },
            },
        ],
    });

test("main preserves uncertain paid receipts when an output directory is reused", async (t) => {
    const prior = {
        ...partial(),
        reservedPollen: 0.2,
        calls: [{ kind: "inference", status: "pending", reserved: 0.2 }],
    };
    const out = await output(t, prior);
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        requests++;
        return catalog(url) ?? noAction();
    });
    await assert.rejects(main(envFor(out)), /existing|reuse|uncertain|resume/i);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "research.json"), "utf8")),
        prior,
    );
    assert.equal(
        requests,
        0,
        "Existing evidence must be checked before any provider call",
    );
});

test("a disconnected paid request is persisted and prevents all later paid calls", async (t) => {
    const out = await output(t);
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        const free = catalog(url);
        if (free) return free;
        paid++;
        const saved = JSON.parse(
            await readFile(join(out, "research.json"), "utf8"),
        );
        assert.equal(saved.calls.at(-1).status, "pending");
        assert.ok(saved.reservedPollen > 0);
        throw new Error("Connection interrupted");
    });
    const report = await main(envFor(out));
    assert.equal(paid, 1);
    assert.equal(report.status, "partial");
    assert.equal(report.calls[0].status, "pending");
    assert.equal(report.models[0].status, "blocked");
    assert.match(await readFile(join(out, "research.md"), "utf8"), /partial/);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "research.json"), "utf8")),
        report,
    );
});

test("budget exhaustion happens before the first paid provider request", async (t) => {
    const out = await output(t);
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        const free = catalog(url);
        if (free) return free;
        paid++;
        return noAction();
    });
    const report = await main({ ...envFor(out), MAX_POLLEN: "0.001" });
    assert.equal(paid, 0);
    assert.equal(report.calls.length, 0);
    assert.equal(report.reservedPollen, 0);
    assert.equal(report.status, "partial");
});

test("main persists researched evidence and publisher consumes the exact partial artifact", async (t) => {
    const out = await output(t);
    const action = (entries) => ({
        role: "assistant",
        content: null,
        tool_calls: entries.map(([name, args], index) => ({
            id: `runtime-${index}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
        })),
    });
    const candidate = {
        routes: [],
        discoveries: [],
        gaps: [
            "No document-supported equivalent; account access remains unknown",
        ],
    };
    const turns = [
        action([
            [
                "research",
                {
                    action: "plan",
                    questions: [
                        "Which exact model version is offered?",
                        "What is the complete workload pricing?",
                        "Which evidence contradicts provider availability?",
                    ],
                    ...candidate,
                },
            ],
        ]),
        action(
            ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
                "search",
                {
                    scope,
                    engine: "exa",
                    mode: "web",
                    purpose: scope === "alternatives" ? "challenge" : "explore",
                    query: `runtime-v1 ${scope} availability`,
                },
            ]),
        ),
        action([["research", { action: "verify", ...candidate }]]),
        action([["research", { action: "submit", ...candidate }]]),
    ];
    let modelTurns = 0,
        searches = 0,
        writes = 0;
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url.startsWith("https://api.github.com/")) {
            if (!options.method) return Response.json([]);
            writes++;
            const body = JSON.parse(options.body).body;
            assert.match(body, /partial/);
            assert.match(body, /1\/1/);
            return Response.json({
                number: 789,
                html_url:
                    "https://github.com/pollinations/pollinations/issues/789",
            });
        }
        const free = catalog(url);
        if (free) return free;
        if (url.endsWith("/mcp/exa")) {
            searches++;
            return Response.json({
                result: {
                    content: [
                        {
                            type: "text",
                            text: "No exact equivalent confirmed; this is a research gap.",
                        },
                    ],
                },
            });
        }
        const payload = JSON.parse(options.body);
        assert.equal(payload.model, inference.name);
        if (!JSON.parse(payload.messages[1].content).model) return noAction();
        const message = turns[modelTurns++];
        assert.ok(message, "Model must complete in four inference turns");
        return Response.json({
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            choices: [{ message }],
        });
    });
    const report = await main(envFor(out));
    assert.equal(report.status, "partial");
    assert.equal(report.models[0].status, "researched");
    assert.equal(report.models[0].searches.length, 4);
    assert.equal(report.models[0].recommendation, null);
    assert.equal(modelTurns, 4);
    assert.equal(searches, 4);
    assert.equal(report.calls.length, 9);
    assert.ok(report.reservedPollen <= report.maxPollen);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "official-catalog.json"), "utf8")),
        inventory,
    );
    const receipt = await publish(issueEnv(out));
    assert.equal(writes, 1);
    assert.equal(receipt.number, 789);
});

for (const usage of [
    { total_tokens: "15", prompt_tokens: 10, completion_tokens: 5 },
    { total_tokens: 15, prompt_tokens: -1, completion_tokens: 16 },
    { total_tokens: 15, prompt_tokens: 10, completion_tokens: 50 },
    { total_tokens: 15 },
])
    test(`malformed provider usage stops further spending: ${JSON.stringify(usage)}`, async (t) => {
        const out = await output(t);
        let paid = 0;
        t.mock.method(globalThis, "fetch", async (url) => {
            const free = catalog(url);
            if (free) return free;
            paid++;
            return noAction(usage);
        });
        const report = await main(envFor(out));
        assert.equal(
            paid,
            1,
            "Unverifiable usage must not permit the next paid task",
        );
        assert.match(report.discovery.reason, /usage/i);
        assert.notEqual(report.calls[0].status, "received");
    });

test("publisher creates one parent for useful partial results and records the exact receipt", async (t) => {
    const out = await output(t, partial());
    const writes = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (!options.method) return Response.json([]);
        writes.push({ url, ...options });
        return Response.json({
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
        });
    });
    const receipt = await publish(issueEnv(out));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "POST");
    const payload = JSON.parse(writes[0].body);
    assert.match(payload.body, /partial/);
    assert.match(payload.body, /1\/1/);
    assert.ok(payload.body.endsWith(marker));
    assert.equal(payload.labels, undefined);
    assert.deepEqual(receipt, {
        number: 789,
        url: "https://github.com/pollinations/pollinations/issues/789",
        runId: "123",
    });
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
        receipt,
    );
});

test("publisher paginates reconciliation and updates an existing parent without creating another", async (t) => {
    const out = await output(t, partial());
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        requests.push({ url, method: options.method ?? "GET" });
        if (url.endsWith("page=1"))
            return Response.json(
                Array.from({ length: 100 }, (_, i) => ({
                    number: i + 1000,
                    body: "Other issue",
                    created_at: "2026-10-11T02:00:00Z",
                })),
            );
        if (url.endsWith("page=2"))
            return Response.json([
                {
                    number: 800,
                    body: marker,
                    pull_request: {},
                    created_at: "2026-10-11T01:30:00Z",
                },
                {
                    number: 789,
                    body: marker,
                    created_at: "2026-10-11T01:00:00Z",
                },
            ]);
        assert.equal(options.method, "PATCH");
        assert.ok(url.endsWith("/789"));
        return Response.json({
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
        });
    });
    await publish(issueEnv(out));
    assert.deepEqual(
        requests.map(({ method }) => method),
        ["GET", "GET", "PATCH"],
    );
});

test("ambiguous duplicate parents are rejected before a write", async (t) => {
    const out = await output(t, partial());
    let writes = 0;
    t.mock.method(globalThis, "fetch", async (_, options) => {
        if (options.method) {
            writes++;
            return Response.json({
                number: 789,
                html_url:
                    "https://github.com/pollinations/pollinations/issues/789",
            });
        }
        return Response.json(
            [789, 790].map((number) => ({
                number,
                body: marker,
                created_at: "2026-10-11T01:00:00Z",
            })),
        );
    });
    await assert.rejects(publish(issueEnv(out)), /duplicate|ambiguous/i);
    assert.equal(writes, 0);
});

for (const result of [
    {},
    { number: 789, html_url: "https://example.com/issues/789" },
    {
        number: "789",
        html_url: "https://github.com/pollinations/pollinations/issues/789",
    },
])
    test(`publisher rejects malformed success receipts: ${JSON.stringify(result)}`, async (t) => {
        const out = await output(t, partial());
        t.mock.method(globalThis, "fetch", async (_, options) =>
            Response.json(options.method ? result : []),
        );
        await assert.rejects(
            publish(issueEnv(out)),
            /receipt|issue|response|number|URL/i,
        );
        await assert.rejects(readFile(join(out, "parent-issue.json")), {
            code: "ENOENT",
        });
    });

test("publisher HTTP failure is never retried or recorded as success", async (t) => {
    const out = await output(t, partial());
    let writes = 0;
    t.mock.method(globalThis, "fetch", async (_, options) => {
        if (!options.method) return Response.json([]);
        writes++;
        return new Response("Unavailable", { status: 503 });
    });
    await assert.rejects(publish(issueEnv(out)), /503/);
    assert.equal(writes, 1);
    await assert.rejects(readFile(join(out, "parent-issue.json")), {
        code: "ENOENT",
    });
});

test("publisher rejects a complete report with missing selected model results", async (t) => {
    const report = partial();
    report.status = "complete";
    report.selectedCount = 2;
    report.discovery.status = "researched";
    const out = await output(t, report);
    let writes = 0;
    t.mock.method(globalThis, "fetch", async (_, options) => {
        if (!options.method) return Response.json([]);
        writes++;
        return Response.json({
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
        });
    });
    await assert.rejects(publish(issueEnv(out)), /complete|catalog|coverage/i);
    assert.equal(writes, 0);
});

test("parent issue accepts only the exact workflow run or its artifact URL", () => {
    const report = partial();
    for (const suffix of [
        "123other",
        "123/artifacts/456extra",
        "123?token=test-only",
        "123/../../issues/1",
    ])
        assert.throws(
            () =>
                parentIssue(
                    report,
                    `https://github.com/pollinations/pollinations/actions/runs/${suffix}`,
                ),
            /URL|evidence|artifact/i,
        );
    assert.ok(parentIssue(report, artifact).body.includes(artifact));
});

test("workflow keeps manual main-only launch, read-only checkout, evidence and scoped publishing", async () => {
    const workflow = await readFile(
        new URL("../../.github/workflows/models-research.yml", import.meta.url),
        "utf8",
    );
    assert.match(workflow, /workflow_dispatch:/);
    const triggers = workflow.slice(
        workflow.indexOf("on:"),
        workflow.indexOf("permissions:"),
    );
    assert.doesNotMatch(
        triggers,
        /^\s+(?:schedule|pull_request|pull_request_target|issues):/m,
    );
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(
        workflow,
        /POLLINATIONS_API_KEY: \$\{\{ secrets\.PLN_GITHUB_POLLY_KEY \}\}/,
    );
    assert.match(
        workflow,
        /Save findings and partial evidence[\s\S]*?if: always\(\)/,
    );
    assert.match(
        workflow,
        /inputs\.publish_issue && steps\.evidence\.outcome == 'success'/,
    );
    const researchStep = workflow.slice(
        workflow.indexOf("- name: Research official"),
        workflow.indexOf("- name: Save findings"),
    );
    assert.doesNotMatch(researchStep, /GITHUB_TOKEN:/);
});
