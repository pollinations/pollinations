import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    budgetUsed,
    main,
    parentIssue,
    publish,
    reserve,
} from "./researcher.mjs";

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
const publisherAuthor = { login: "github-actions[bot]", type: "Bot" };
const envFor = (out) => ({
    RESEARCH_MODE: "interactive",
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
    let savedBeforeDisconnect;
    t.mock.method(globalThis, "fetch", async (url) => {
        const free = catalog(url);
        if (free) return free;
        paid++;
        savedBeforeDisconnect = JSON.parse(
            await readFile(join(out, "research.json"), "utf8"),
        );
        throw new Error("Connection interrupted");
    });
    const report = await main(envFor(out));
    assert.equal(paid, 1);
    assert.equal(savedBeforeDisconnect.calls.at(-1).status, "pending");
    assert.ok(savedBeforeDisconnect.reservedPollen > 0);
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

test("explicit model selection spends inference only on its group; full catalog retains discovery", async (t) => {
    const exit = process.exitCode;
    for (const selection of [model.name, "runtime", ""]) {
        const out = await output(t);
        const tasks = [];
        t.mock.method(globalThis, "fetch", async (url, options) => {
            const free = catalog(url);
            if (free) return free;
            tasks.push(
                JSON.parse(JSON.parse(options.body).messages[1].content),
            );
            return noAction();
        });
        const report = await main({ ...envFor(out), MODELS: selection });
        assert.equal(
            tasks.some(({ task }) => task.startsWith("Deep discovery")),
            !selection,
        );
        assert.deepEqual(
            tasks
                .filter(({ models }) => models)
                .flatMap(({ models }) => models.map(({ name }) => name))
                .sort(),
            (selection
                ? [model.name]
                : inventory.map(({ name }) => name)
            ).sort(),
        );
        assert.equal(
            report.discovery.status,
            selection ? "skipped" : "blocked",
        );
        assert.deepEqual(report.requestedModels, selection ? [model.name] : []);
        assert.deepEqual(report.models[0].actions, []);
        t.mock.restoreAll();
    }
    t.after(() => {
        process.exitCode = exit;
    });
});

test("uncertain HTTP failures retain quotes and stop later groups; definite 4xx remain failed", async (t) => {
    const exit = process.exitCode;
    const selected = Array.from({ length: 9 }, (_, index) => ({
        ...model,
        name: `publisher/http-${index}`,
        aliases: [],
    }));
    for (const status of [408, 502, 503, 400]) {
        const out = await output(t);
        let paid = 0;
        t.mock.method(globalThis, "fetch", async (url) => {
            if (url.includes("/models?"))
                return Response.json([...selected, inference]);
            const free = catalog(url);
            if (free) return free;
            paid++;
            return new Response("HTTP failure", { status });
        });
        const report = await main({
            ...envFor(out),
            MODELS: selected.map(({ name }) => name).join(","),
        });
        assert.equal(paid, status === 400 ? 2 : 1);
        assert.equal(
            report.calls[0].status,
            status === 400 ? "failed" : "pending",
        );
        assert.equal(report.calls[0].http, status);
        assert.ok(report.calls.every(({ reserved }) => reserved > 0));
        assert.ok(report.budgetUsedPollen > 0);
        assert.equal(report.budgetUsedPollen, report.reservedPollen);
        assert.ok(report.models.every(({ status }) => status === "blocked"));
        t.mock.restoreAll();
    }
    t.after(() => {
        process.exitCode = exit;
    });
});

test("skipped discovery can complete only the exact canonical selected model set", () => {
    const report = {
        ...partial(),
        status: "complete",
        requestedModels: [model.name],
        discovery: { status: "skipped" },
    };
    assert.doesNotThrow(() => parentIssue(report, artifact));
    for (const requestedModels of [
        "x",
        { length: 1 },
        [""],
        ["unrelated"],
        [model.name, model.name],
        [],
    ])
        assert.throws(
            () => parentIssue({ ...report, requestedModels }, artifact),
            /Incomplete selected research/,
        );
});

test("settled inference releases unused quotes without changing historical reservations", () => {
    const report = { maxPollen: 1, reservedPollen: 0, calls: [] };
    const first = reserve(report, 0.8, "inference:test");
    first.accountedPollen = 0.1;
    first.status = "received";
    assert.equal(budgetUsed(report), 0.1);
    reserve(report, 0.8, "inference:test");
    assert.equal(report.reservedPollen, 1.6);
    assert.equal(report.budgetUsedPollen, 0.9);
    assert.throws(() => reserve(report, 0.05, "search"), /uncertain/);
});

test("uncertain, failed, fixed-price, and invalid settlements retain their full quote", () => {
    for (const [status, kind, accountedPollen] of [
        ["pending", "inference:test", 0.01],
        ["failed", "inference:test", 0.01],
        ["received", "web_search_exa", 0.01],
        ["received", "inference:test", undefined],
        ["received", "inference:test", NaN],
        ["received", "inference:test", Infinity],
        ["received", "inference:test", -0.1],
        ["received", "inference:test", 0.6],
        ["received", "inference:test", "0.01"],
    ]) {
        assert.equal(
            budgetUsed({
                calls: [{ status, kind, accountedPollen, reserved: 0.5 }],
            }),
            0.5,
        );
    }
    assert.throws(
        () => budgetUsed({ calls: [{ reserved: NaN }] }),
        /reservation/,
    );
});

test("main uses settled usage to admit a subsequent inference despite cumulative quotes", async (t) => {
    const out = await output(t);
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        const free = catalog(url);
        if (free) return free;
        paid++;
        if (paid !== 1) return noAction();
        return Response.json({
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            choices: [
                {
                    message: {
                        role: "assistant",
                        tool_calls: [
                            {
                                id: "plan",
                                type: "function",
                                function: {
                                    name: "research",
                                    arguments: JSON.stringify({
                                        action: "plan",
                                        questions: [
                                            "Which exact version?",
                                            "What full pricing?",
                                            "Which source contradicts it?",
                                        ],
                                        routes: [],
                                        discoveries: [],
                                        gaps: [],
                                    }),
                                },
                            },
                        ],
                    },
                },
            ],
        });
    });
    const report = await main({ ...envFor(out), MAX_POLLEN: "0.12" });
    assert.equal(paid, 2);
    assert.ok(report.reservedPollen > report.maxPollen);
    assert.equal(report.budgetUsedPollen, 2 * (10 * 0.000002 + 5 * 0.00001));
    assert.ok(report.budgetUsedPollen <= report.maxPollen);
});

test("GitHub paid research reruns fail before network or output writes", async (t) => {
    const out = await output(t);
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
        requests++;
        throw new Error("Unexpected network request");
    });
    await assert.rejects(
        main({
            ...envFor(out),
            GITHUB_ACTIONS: "true",
            GITHUB_RUN_ATTEMPT: "2",
        }),
        /reruns/,
    );
    assert.equal(requests, 0);
    await assert.rejects(readFile(join(out, "research.json")), {
        code: "ENOENT",
    });
});

test("main persists selected-scope complete evidence and publisher consumes the exact artifact", async (t) => {
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
                    models: [model.name],
                },
            ]),
        ),
        action([
            [
                "research",
                {
                    action: "verify",
                    ...candidate,
                    models: [{ name: model.name, ...candidate }],
                },
            ],
        ]),
        action([
            [
                "research",
                {
                    action: "submit",
                    ...candidate,
                    models: [{ name: model.name, ...candidate }],
                },
            ],
        ]),
    ];
    let modelTurns = 0,
        searches = 0,
        writes = 0;
    let issuedBody;
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url.startsWith("https://api.github.com/")) {
            if (!options.method) return Response.json([]);
            writes++;
            issuedBody = JSON.parse(options.body).body;
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
        if (!JSON.parse(payload.messages[1].content).models) return noAction();
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
    const report = await main({ ...envFor(out), GITHUB_SHA: "c".repeat(40) });
    assert.equal(report.status, "complete");
    assert.equal(report.models[0].status, "researched");
    assert.equal(report.models[0].searches.length, 4);
    assert.deepEqual(
        report.models[0].actions.map(({ turn, tool, action, status }) => ({
            turn,
            tool,
            action,
            status,
        })),
        [
            { turn: 1, tool: "research", action: "plan", status: "planned" },
            ...Array.from({ length: 4 }, () => ({
                turn: 2,
                tool: "search",
                action: undefined,
                status: "completed",
            })),
            { turn: 3, tool: "research", action: "verify", status: "audited" },
            {
                turn: 4,
                tool: "research",
                action: "submit",
                status: "submitted",
            },
        ],
    );
    assert.equal(report.models[0].recommendation, null);
    assert.equal(modelTurns, 4);
    assert.equal(searches, 4);
    assert.equal(report.calls.length, 8);
    for (const receipt of report.calls) {
        if (receipt.kind.startsWith("inference:"))
            assert.equal(receipt.accountedPollen, 10 * 0.000002 + 5 * 0.00001);
        else assert.equal(receipt.reserved, 0.007);
    }
    assert.equal(
        report.reservedPollen,
        report.calls.reduce((sum, receipt) => sum + receipt.reserved, 0),
    );
    assert.ok(report.budgetUsedPollen <= report.maxPollen);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "official-catalog.json"), "utf8")),
        inventory,
    );
    const receipt = await publish(issueEnv(out));
    assert.equal(issuedBody.includes("(partial)"), false);
    assert.match(issuedBody, /1\/1/);
    assert.equal(issuedBody.match(/\]\((https:[^)]+)\)/)?.[1], artifact);
    const savedReport = JSON.parse(
        await readFile(join(out, "research.json"), "utf8"),
    );
    assert.equal(savedReport.catalogDigest, report.catalogDigest);
    assert.equal(savedReport.sha, report.sha);
    assert.equal(issuedBody.includes(report.catalogDigest), false);
    assert.equal(issuedBody.includes(report.sha), false);
    assert.equal(writes, 1);
    assert.equal(receipt.number, 789);
});

test("main selects every official modality and excludes community models before budget blocking", async (t) => {
    const out = await output(t);
    const official = [
        inference,
        ...[
            "text",
            "image",
            "video",
            "audio",
            "embedding",
            "ocr",
            "svg",
            "3d",
        ].map((category) => ({
            ...model,
            name: `publisher/${category}-v1`,
            category,
        })),
    ];
    const community = {
        ...model,
        name: "community/user/model",
        community: true,
    };
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        if (url.includes("/models?"))
            return Response.json([...official, community]);
        const free = catalog(url);
        if (free) return free;
        paid++;
        return noAction();
    });
    const report = await main({
        ...envFor(out),
        MODELS: "",
        MAX_POLLEN: "0.001",
    });
    assert.equal(paid, 0);
    assert.equal(report.officialCount, official.length);
    assert.equal(report.selectedCount, official.length);
    assert.deepEqual(
        report.models.map(({ name, category }) => ({ name, category })),
        official.map(({ name, category }) => ({ name, category })),
    );
    assert.ok(report.models.every(({ status }) => status === "blocked"));
    assert.equal(report.discovery.status, "blocked");
    assert.equal(report.status, "partial");
    assert.equal(report.reservedPollen, 0);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "official-catalog.json"), "utf8")),
        official,
    );
    assert.equal(
        report.catalogDigest,
        createHash("sha256").update(JSON.stringify(official)).digest("hex"),
    );
});

test("main preserves fetched Exa text under its returned source URL in partial evidence", async (t) => {
    const out = await output(t);
    const requestedUrl = "https://1.1.1.1/provider-model";
    const returnedUrl = "https://8.8.8.8/actual-model";
    const text =
        "Actual primary page describes exact provider model identity and pricing evidence.";
    let turns = 0,
        fetches = 0,
        fetchedRequest;
    const action = (name, args) => ({
        role: "assistant",
        content: null,
        tool_calls: [
            {
                id: `source-${turns}`,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
            },
        ],
    });
    t.mock.method(globalThis, "fetch", async (url, options) => {
        const free = catalog(url);
        if (free) return free;
        if (url.endsWith("/mcp/exa")) {
            fetches++;
            fetchedRequest = JSON.parse(options.body);
            return Response.json({
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                results: [{ url: returnedUrl, text }],
                            }),
                        },
                    ],
                },
            });
        }
        const context = JSON.parse(
            JSON.parse(options.body).messages[1].content,
        );
        if (context.model) return noAction();
        turns++;
        const message =
            turns === 1
                ? action("research", {
                      action: "plan",
                      questions: [
                          "Which exact model version is offered?",
                          "What is the complete workload pricing?",
                          "Which evidence contradicts provider availability?",
                      ],
                      routes: [],
                      discoveries: [],
                      gaps: [],
                  })
                : turns === 2
                  ? action("fetch", { url: requestedUrl, mode: "exa" })
                  : {
                        role: "assistant",
                        content: "Interrupted before final submission",
                    };
        return Response.json({
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            choices: [{ message }],
        });
    });
    const report = await main({ ...envFor(out), MODELS: "" });
    assert.equal(fetches, 1);
    assert.deepEqual(fetchedRequest.params.arguments.urls, [requestedUrl]);
    assert.equal(report.status, "partial");
    assert.equal(report.discovery.status, "blocked");
    assert.equal(report.discovery.sources.length, 1);
    const source = report.discovery.sources[0];
    assert.equal(source.url, returnedUrl);
    assert.notEqual(source.url, requestedUrl);
    assert.equal(source.text, text);
    assert.equal(source.status, "fetched");
    assert.equal(source.method, "pollinations-exa");
    assert.equal(
        source.digest,
        createHash("sha256").update(text).digest("hex"),
    );
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "research.json"), "utf8")).discovery
            .sources,
        report.discovery.sources,
    );
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
        assert.match(report.models[0].reason, /usage/i);
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
                    user: publisherAuthor,
                    pull_request: {},
                    created_at: "2026-10-11T01:30:00Z",
                },
                {
                    number: 789,
                    body: marker,
                    user: publisherAuthor,
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
                user: publisherAuthor,
                created_at: "2026-10-11T01:00:00Z",
            })),
        );
    });
    await assert.rejects(publish(issueEnv(out)), /duplicate|ambiguous/i);
    assert.equal(writes, 0);
});

test("publisher reuses its persisted parent receipt when issue lists lag", async (t) => {
    const out = await output(t, partial());
    const created = {
        number: 789,
        html_url: "https://github.com/pollinations/pollinations/issues/789",
        body: marker,
        user: publisherAuthor,
    };
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        const method = options.method ?? "GET";
        requests.push({ url, method });
        if (method === "GET")
            return Response.json(url.endsWith("/789") ? created : []);
        return Response.json(created);
    });
    const first = await publish(issueEnv(out));
    const second = await publish(issueEnv(out));
    assert.deepEqual(second, first);
    assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
    const patches = requests.filter(({ method }) => method === "PATCH");
    assert.equal(patches.length, 1);
    assert.ok(patches[0].url.endsWith("/789"));
    assert.ok(
        requests.some(
            ({ url, method }) => method === "GET" && url.endsWith("/789"),
        ),
    );
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
        first,
    );
});

test("publisher ignores a human-authored issue that copies its run marker", async (t) => {
    const out = await output(t, partial());
    const forged = {
        number: 777,
        body: marker,
        user: { login: "community-user", type: "User" },
        created_at: "2026-10-11T01:00:00Z",
    };
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        requests.push({ url, method: options.method ?? "GET" });
        if (!options.method) return Response.json([forged]);
        return Response.json({
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
            user: publisherAuthor,
        });
    });
    const receipt = await publish(issueEnv(out));
    assert.deepEqual(
        requests.map(({ method }) => method),
        ["GET", "POST"],
    );
    assert.ok(requests.every(({ url }) => !url.endsWith("/777")));
    assert.equal(receipt.number, 789);
});

test("publisher rejects a saved parent resolving to a human-authored copied marker", async (t) => {
    const out = await output(t, partial());
    const receipt = {
        number: 777,
        url: "https://github.com/pollinations/pollinations/issues/777",
        runId: "123",
    };
    await writeFile(join(out, "parent-issue.json"), JSON.stringify(receipt));
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        requests.push({ url, method: options.method ?? "GET" });
        return Response.json({
            number: 777,
            body: marker,
            user: { login: "community-user", type: "User" },
        });
    });
    await assert.rejects(publish(issueEnv(out)), /identity|author|parent/i);
    assert.deepEqual(
        requests.map(({ method }) => method),
        ["GET"],
    );
    assert.ok(requests[0].url.endsWith("/777"));
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
        receipt,
    );
    await assert.rejects(readFile(join(out, "parent-publication.json")), {
        code: "ENOENT",
    });
});

for (const failure of ["disconnect", "malformed receipt"])
    test(`publisher retains pending intent after POST ${failure} and refuses a second POST`, async (t) => {
        const out = await output(t, partial());
        const publicationPath = join(out, "parent-publication.json");
        let writes = 0,
            publicationBeforePost;
        t.mock.method(globalThis, "fetch", async (_, options) => {
            if (!options.method) return Response.json([]);
            writes++;
            publicationBeforePost = JSON.parse(
                await readFile(publicationPath, "utf8"),
            );
            if (failure === "disconnect")
                throw new Error("Publication connection interrupted");
            return Response.json({ number: 789 });
        });
        await assert.rejects(
            publish(issueEnv(out)),
            failure === "disconnect" ? /connection interrupted/ : /receipt/,
        );
        const pending = { runId: "123", status: "pending", number: null };
        assert.deepEqual(publicationBeforePost, pending);
        assert.deepEqual(
            JSON.parse(await readFile(publicationPath, "utf8")),
            pending,
        );
        assert.equal(writes, 1);
        await assert.rejects(readFile(join(out, "parent-issue.json")), {
            code: "ENOENT",
        });
        await assert.rejects(
            publish(issueEnv(out)),
            /publication uncertain|no new issue/i,
        );
        assert.equal(
            writes,
            1,
            "Uncertain publication must never create a second parent",
        );
        assert.deepEqual(
            JSON.parse(await readFile(publicationPath, "utf8")),
            pending,
        );
    });

test("publisher retry with fresh output and no original parent refuses to POST", async (t) => {
    const out = await output(t, partial());
    const methods = [];
    t.mock.method(globalThis, "fetch", async (_, options) => {
        methods.push(options.method ?? "GET");
        return Response.json(
            options.method
                ? {
                      number: 789,
                      html_url:
                          "https://github.com/pollinations/pollinations/issues/789",
                  }
                : [],
        );
    });
    await assert.rejects(
        publish({ ...issueEnv(out), GITHUB_RUN_ATTEMPT: "2" }),
        /publication uncertain|no new issue/i,
    );
    assert.deepEqual(methods, ["GET"]);
    await assert.rejects(readFile(join(out, "parent-publication.json")), {
        code: "ENOENT",
    });
    await assert.rejects(readFile(join(out, "parent-issue.json")), {
        code: "ENOENT",
    });
});

test(
    "concurrent publishers exclusively claim fresh publication intent before POST",
    { timeout: 5000 },
    async (t) => {
        const out = await output(t, partial());
        let reads = 0,
            posts = 0,
            release;
        const bothListed = new Promise((resolve) => {
            release = resolve;
        });
        const created = {
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
        };
        t.mock.method(globalThis, "fetch", async (_, options) => {
            if (!options.method) {
                reads++;
                if (reads === 2) release();
                await bothListed;
                return Response.json([]);
            }
            posts++;
            return Response.json(created);
        });
        const results = await Promise.allSettled([
            publish(issueEnv(out)),
            publish(issueEnv(out)),
        ]);
        assert.equal(
            reads,
            2,
            "Both publishers must pass the missing-receipt checks and list barrier",
        );
        assert.equal(posts, 1);
        const success = results.filter(({ status }) => status === "fulfilled");
        const failures = results.filter(({ status }) => status === "rejected");
        assert.equal(success.length, 1);
        assert.equal(failures.length, 1);
        assert.equal(failures[0].reason.code, "EEXIST");
        const receipt = { number: 789, url: created.html_url, runId: "123" };
        assert.deepEqual(success[0].value, receipt);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
            receipt,
        );
        assert.deepEqual(
            JSON.parse(
                await readFile(join(out, "parent-publication.json"), "utf8"),
            ),
            { ...receipt, status: "received" },
        );
    },
);

for (const recovery of ["workflow retry", "pending publication"])
    test(`publisher ${recovery} reconciles an old marker beyond the first page`, async (t) => {
        const out = await output(t, partial());
        if (recovery === "pending publication")
            await writeFile(
                join(out, "parent-publication.json"),
                JSON.stringify({
                    runId: "123",
                    status: "pending",
                    number: null,
                }),
            );
        const requests = [];
        const existing = {
            number: 789,
            html_url: "https://github.com/pollinations/pollinations/issues/789",
            body: marker,
            user: publisherAuthor,
            created_at: "2026-10-09T00:00:00Z",
        };
        t.mock.method(globalThis, "fetch", async (url, options) => {
            const method = options.method ?? "GET";
            requests.push({ url, method, body: options.body });
            if (url.endsWith("page=1"))
                return Response.json(
                    Array.from({ length: 100 }, (_, index) => ({
                        number: 1000 + index,
                        body: "Unrelated old issue",
                        created_at: "2026-10-10T00:00:00Z",
                    })),
                );
            if (url.endsWith("page=2")) return Response.json([existing]);
            return Response.json(existing);
        });
        const receipt = await publish({
            ...issueEnv(out),
            GITHUB_RUN_ATTEMPT: recovery === "workflow retry" ? "2" : "1",
        });
        assert.deepEqual(
            requests.map(({ method }) => method),
            ["GET", "GET", "PATCH"],
        );
        assert.ok(requests[1].url.endsWith("page=2"));
        assert.ok(requests[2].url.endsWith("/789"));
        assert.ok(JSON.parse(requests[2].body).body.includes(marker));
        assert.deepEqual(receipt, {
            number: 789,
            url: existing.html_url,
            runId: "123",
        });
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
            receipt,
        );
        assert.deepEqual(
            JSON.parse(
                await readFile(join(out, "parent-publication.json"), "utf8"),
            ),
            { ...receipt, status: "received" },
        );
    });

test("publisher refuses to replace a persisted parent that is no longer accessible", async (t) => {
    const out = await output(t, partial());
    const receipt = {
        number: 789,
        url: "https://github.com/pollinations/pollinations/issues/789",
        runId: "123",
    };
    await writeFile(join(out, "parent-issue.json"), JSON.stringify(receipt));
    const writes = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (options.method) {
            writes.push(options.method);
            return Response.json({
                number: 790,
                html_url:
                    "https://github.com/pollinations/pollinations/issues/790",
            });
        }
        return url.endsWith("/789")
            ? new Response("Not found", { status: 404 })
            : Response.json([]);
    });
    await assert.rejects(
        publish(issueEnv(out)),
        /404|receipt|parent|reconcile/i,
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
        receipt,
    );
});

for (const receipt of [
    {
        number: 789,
        url: "https://github.com/pollinations/pollinations/issues/789",
        runId: "other-run",
    },
    { number: 789, url: "https://example.com/issues/789", runId: "123" },
    {
        number: 789,
        url: "https://github.com/pollinations/pollinations/issues/790",
        runId: "123",
    },
])
    test(`publisher rejects malformed persisted receipts: ${JSON.stringify(receipt)}`, async (t) => {
        const out = await output(t, partial());
        await writeFile(
            join(out, "parent-issue.json"),
            JSON.stringify(receipt),
        );
        let requests = 0;
        t.mock.method(globalThis, "fetch", async (_, options) => {
            requests++;
            return Response.json(
                options.method
                    ? {
                          number: 789,
                          html_url:
                              "https://github.com/pollinations/pollinations/issues/789",
                      }
                    : [],
            );
        });
        await assert.rejects(publish(issueEnv(out)), /receipt|run|URL|parent/i);
        assert.equal(requests, 0);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "parent-issue.json"), "utf8")),
            receipt,
        );
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
    assert.equal(
        parentIssue(report, artifact).body.match(/\]\((https:[^)]+)\)/)?.[1],
        artifact,
    );
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
