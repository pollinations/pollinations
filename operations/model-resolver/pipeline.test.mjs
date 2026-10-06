import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Agents,
    checkedPath,
    decisionMarker,
    hash,
    Pipeline,
    parseDecision,
    validateDecision,
    validateOperation,
    validateProviderContract,
    verifiedApprovals,
} from "./pipeline.mjs";
import { isPublicUrl } from "./public-url.mjs";
import { Workspace } from "./sandbox.mjs";
import { commitCandidate, createServices, publishDraft } from "./worker.mjs";

const SHA = "a".repeat(40);
test("hosted agents reserve downstream prices and Polli pins one task inference model", async () => {
    const env = {
        POLLI_MODEL: "community/pollinations-ai/polli",
        POLLI_BASE_MODEL: "openai/gpt-6-sol",
    };
    const catalog = [
        {
            name: env.POLLI_MODEL,
            agent: true,
            pricing: { currency: "pollen" },
            capabilities: [],
        },
        {
            name: "community/pollinations-ai/model-resolver-agent",
            agent: true,
            base_model: env.POLLI_BASE_MODEL,
            capabilities: [],
        },
        {
            name: env.POLLI_BASE_MODEL,
            output_modalities: ["text"],
            capabilities: [],
            pricing: {
                currency: "pollen",
                promptTextTokens: 0.000001,
                completionTextTokens: 0.000002,
            },
        },
    ];
    let request;
    const agents = new Agents(env, async (url, init) => {
        if (url.includes("/models?")) return Response.json(catalog);
        request = JSON.parse(init.body);
        return Response.json({
            choices: [{ message: { content: "done" } }],
            usage: { total_tokens: 1 },
        });
    });
    const messages = [{ role: "user", content: "task" }];
    const expected =
        (Buffer.byteLength(JSON.stringify(messages)) + 32000) * 0.000001 +
        4096 * 0.000002;
    assert.equal(await agents.quote(env.POLLI_MODEL, messages), expected);
    assert.equal(await agents.quote(catalog[1].name, messages), expected);
    await assert.rejects(
        agents.call(env.POLLI_MODEL, messages),
        /bounded task tool/,
    );
    await agents.call(env.POLLI_MODEL, messages, [
        { type: "function", function: { name: "model_task" } },
    ]);
    assert.deepEqual(request.metadata, { model: env.POLLI_BASE_MODEL });
    assert.equal(request.stream, false);
    catalog[1].capabilities = ["pollinations_models"];
    await assert.rejects(
        agents.quote(catalog[1].name, messages),
        /bounded text rate sheet/,
    );
    catalog[1].capabilities = [];
    catalog[1].base_model = env.POLLI_MODEL;
    await assert.rejects(
        agents.quote(catalog[1].name, messages),
        /bounded text rate sheet/,
    );
    delete catalog[2].pricing.promptTextTokens;
    assert.equal(
        await agents.quote(env.POLLI_MODEL, messages),
        4096 * 0.000002,
    );
});
function decision() {
    return validateDecision({
        status: "ready",
        summary: "Verified evidence",
        baseSha: SHA,
        version: "v1",
        contract: {
            canonicalName: "example/model",
            aliases: ["example"],
            priceMultiplier: 1,
            paidOnly: true,
            pollinationsGpu: false,
            registryProvider: "existing",
            primaryRoute: {
                provider: "existing",
                model: "v1",
                integration: "existing",
                deployment: null,
                region: null,
            },
            bestFallbackCandidate: null,
            fallbackDecision: "none",
            fallbackReason: "none-verified",
            fallbackRoute: null,
        },
        paths: ["shared/registry/text.ts"],
        apiChange: false,
        apiContract: null,
        checks: [
            {
                id: "capability",
                kind: "capability",
                cwd: "gen.pollinations.ai",
                command: "npx vitest run test/capabilities.test.ts",
            },
            {
                id: "billing",
                kind: "billing",
                cwd: "enter.pollinations.ai",
                command: "npx vitest run test/billing.test.ts",
            },
        ],
    });
}
const raw = (d) => JSON.stringify(d, null, 2);
const body = (d) =>
    `${decisionMarker(hash(raw(d)))}\n\`\`\`model-decision\n${raw(d)}\n\`\`\``;

// Two external boundaries: immutable persistence and remote services. The actual
// state machine, approval parser, scope validator and publication code run here.
function harness(phase = "approval") {
    const rows = new Map();
    const storage = {
        get: async (key) => structuredClone(rows.get(key)),
        put: async (key, value) => rows.set(key, structuredClone(value)),
    };
    const d = decision();
    assert.equal(
        isPublicUrl("https://gen.pollinations.ai/models?reliability=all"),
        true,
    );
    assert.equal(isPublicUrl("https://docs.fal.ai/model-apis/"), true);
    assert.equal(
        isPublicUrl("https://gen.pollinations.ai/models?key=test-only"),
        false,
    );
    assert.equal(isPublicUrl(null), false);
    validateProviderContract(d, ["existing"]);
    assert.throws(
        () => validateProviderContract(d, ["different"]),
        /existing provider/,
    );
    const digest = hash(raw(d));
    const counts = { paid: 0, write: 0, pr: 0, pause: 0, close: 0 };
    const issue = { state: "open", labels: [{ name: "MODEL-READY" }] };
    const comments = [
        { id: 1, body: body(d), user: { type: "Bot" } },
        {
            id: 2,
            body: `MODEL-APPROVED ${digest} model-contract`,
            user: { login: "maintainer", type: "User" },
        },
    ];
    let budget = 1;
    let failed = false;
    const services = {
        github: {
            request: async (path) =>
                path.startsWith("/collaborators/")
                    ? { permission: "maintain" }
                    : issue,
            list: async () => comments,
            comment: async () => ({ id: 3 }),
        },
        agents: {
            preflight: async () => budget,
            quote: async () => 0.01,
            call: async () => {
                counts.paid++;
                return {
                    usage: { total_tokens: 10 },
                    message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: `write-${counts.paid}`,
                                type: "function",
                                function: {
                                    name: "model_task",
                                    arguments: JSON.stringify({
                                        operation: "write",
                                        path: d.paths[0],
                                        content: "approved edit",
                                    }),
                                },
                            },
                            {
                                id: `finish-${counts.paid}`,
                                type: "function",
                                function: {
                                    name: "model_task",
                                    arguments: '{"operation":"finish"}',
                                },
                            },
                        ],
                    },
                };
            },
        },
        workspace: {
            prepare: async () => ({ exitCode: 0 }),
            operation: async () => {
                counts.write++;
                return { written: d.paths[0] };
            },
            verify: async (state) => ({
                sha: state.candidate.sha,
                checks: d.checks.map((check) => ({
                    id: check.id,
                    exitCode: failed ? 1 : 0,
                    stderr: failed ? "assertion failed" : "",
                })),
            }),
            pause: async () => {
                counts.pause++;
            },
            close: async () => {
                counts.close++;
            },
        },
        candidate: async () => ({ sha: "b".repeat(40), branch: "candidate" }),
        publishPr: async (state) => {
            counts.pr++;
            return {
                draft: true,
                head: { sha: state.candidate.sha },
                html_url: "https://github.com/pollinations/pollinations/pull/1",
            };
        },
    };
    const state = {
        id: "issue:1",
        kind: "issue",
        issue: 1,
        phase,
        decision: d,
        digest,
        decisionComment: 1,
        spent: 0,
        turns: 0,
        operations: {},
        messages: [],
    };
    rows.set("task", structuredClone(state));
    return {
        storage,
        services,
        counts,
        issue,
        comments,
        state,
        setBudget: (value) => {
            budget = value;
        },
        failChecks: () => {
            failed = true;
        },
        pipeline: () =>
            new Pipeline(
                storage,
                {
                    TASK_BUDGET: "0.2",
                    MAX_TASK_TURNS: "10",
                    POLLI_MODEL: "community/pollinations-ai/polli",
                },
                services,
            ),
    };
}

test("exact decisions reject unsafe scope, incomplete billing/fallback checks and command escapes", () => {
    const d = decision();
    assert.deepEqual(parseDecision(body(d)).decision, d);
    assert.throws(
        () => parseDecision(body(d).replace('"v1"', '"v2"')),
        /digest/,
    );
    for (const path of [
        "shared/registry/../secrets/key",
        "gen.pollinations.ai/src/.env",
        "AGENTS.md",
        "/shared/registry/text.ts",
    ])
        assert.throws(() => checkedPath(path));
    assert.throws(() =>
        validateOperation({ operation: "read", path: "/.git/config" }, d),
    );
    assert.throws(() =>
        validateOperation(
            {
                operation: "write",
                path: "shared/registry/image.ts",
                content: "x",
            },
            d,
        ),
    );
    assert.throws(() =>
        validateOperation({ operation: "check", checkId: "unapproved" }, d),
    );
    assert.throws(
        () => validateDecision({ ...d, checks: d.checks.slice(0, 1) }),
        /billing/,
    );
    assert.throws(
        () =>
            validateDecision({
                ...d,
                contract: {
                    ...d.contract,
                    bestFallbackCandidate: {
                        ...d.contract.primaryRoute,
                        model: "v2",
                    },
                    fallbackRoute: { ...d.contract.primaryRoute, model: "v2" },
                    fallbackDecision: "use-candidate",
                    fallbackReason: "candidate-selected",
                },
            }),
        /fallback/,
    );
    assert.throws(
        () => validateDecision({ ...d, apiChange: true }),
        /separate API contract/,
    );
    assert.throws(
        () =>
            validateDecision({
                ...d,
                checks: [
                    {
                        ...d.checks[0],
                        command: "npx vitest run test/../../malicious.test.ts",
                    },
                    d.checks[1],
                ],
            }),
        /Checks/,
    );
    const clean = validateDecision({
        ...d,
        privateCosts: 12,
        summary: "secret prose",
        contract: { ...d.contract, accessToken: "never publish" },
    });
    assert.equal(JSON.stringify(clean).includes("never publish"), false);
    assert.equal(JSON.stringify(clean).includes("secret prose"), false);
});

test("approval is maintainer-only, exact-revision and independently required for API changes", async () => {
    const digest = "d".repeat(64);
    const issue = { state: "open", labels: [{ name: "MODEL-READY" }] };
    const comments = ["outsider", "maintainer"].map((login, id) => ({
        id,
        user: { login, type: "User" },
        body: `MODEL-APPROVED ${digest} model-contract`,
    }));
    const github = {
        request: async (path) => ({
            permission: path.includes("maintainer") ? "maintain" : "read",
        }),
    };
    assert.equal(
        (await verifiedApprovals(github, issue, comments, digest, false))[0]
            .actor,
        "maintainer",
    );
    await assert.rejects(
        verifiedApprovals(github, issue, comments, digest, true),
        /public-api/,
    );
    await assert.rejects(
        verifiedApprovals(github, issue, comments, "e".repeat(64), false),
        /approval/,
    );
    await assert.rejects(
        verifiedApprovals(
            github,
            { ...issue, labels: [] },
            comments,
            digest,
            false,
        ),
        /ready/,
    );
});

test("a persisted task resumes through edits, candidate checks and one verified draft", async () => {
    const h = harness();
    for (let i = 0; i < 8; i++) await h.pipeline().advance();
    assert.equal((await h.storage.get("task")).phase, "complete");
    assert.deepEqual(h.counts, {
        paid: 1,
        write: 1,
        pr: 1,
        pause: 0,
        close: 1,
    });
    await h.pipeline().advance();
    assert.equal(h.counts.pr, 1);
});

test("Polli can obtain runner-approved scope without renting or reconnecting a VM", async () => {
    const h = harness();
    const state = await h.pipeline().advance();
    const operation = validateOperation({ operation: "scope" }, state.decision);
    const workspace = new Workspace({}, async () => {}, {});
    const scope = await workspace.operation(state, "scope", operation);
    assert.deepEqual(scope, {
        decision: state.decision,
        approval: state.approvals,
    });
    assert.equal(scope.approval[0].actor, "maintainer");
});

test("VM cleanup must finish before a verified draft task is marked complete", async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) await h.pipeline().advance();
    assert.equal((await h.storage.get("task")).phase, "publish-pr");
    const close = h.services.workspace.close;
    h.services.workspace.close = async () => {
        throw new Error("Task VM cleanup failed");
    };
    const blocked = await h.pipeline().advance();
    assert.equal(blocked.phase, "blocked");
    assert.equal(blocked.failedPhase, "publish-pr");
    assert.match(blocked.error, /VM cleanup failed/);
    h.services.workspace.close = close;
    blocked.phase = blocked.failedPhase;
    await h.storage.put("task", blocked);
    assert.equal((await h.pipeline().advance()).phase, "complete");
    assert.equal(h.counts.close, 1);
    assert.equal(h.counts.paid, 1);
});

test("revoking approval after tool generation prevents any queued edit", async () => {
    const h = harness();
    await h.pipeline().advance();
    await h.pipeline().advance();
    h.comments.pop();
    const state = await h.pipeline().advance();
    assert.equal(state.phase, "blocked");
    assert.equal(state.failedPhase, "tools");
    assert.equal(h.counts.write, 0);
    assert.equal(h.counts.pr, 0);
    assert.equal(h.counts.pause, 1);
});

test("failed candidate tests feed bounded repairs and never publish a PR", async () => {
    const h = harness();
    h.failChecks();
    for (let i = 0; i < 20; i++) await h.pipeline().advance();
    const state = await h.storage.get("task");
    assert.equal(state.phase, "blocked");
    assert.equal(state.repairs, 2);
    assert.equal(h.counts.paid, 3);
    assert.equal(h.counts.pr, 0);
});

test("restart preserves spending and paid results; uncertain inference is never replayed", async () => {
    const h = harness("implement");
    await h
        .pipeline()
        .infer(h.state, "one", "community/pollinations-ai/polli", []);
    const persisted = await h.storage.get("task");
    await h
        .pipeline()
        .infer(persisted, "one", "community/pollinations-ai/polli", []);
    assert.equal(h.counts.paid, 1);
    assert.equal(persisted.turns, 1);
    assert.equal(
        (await h.pipeline().initialize({ id: "issue:1", kind: "issue" })).turns,
        1,
    );
    h.setBudget(0.7);
    await assert.rejects(h.pipeline().budget(persisted), /spending/);
    await h.storage.put("task", {
        ...persisted,
        inference: { purpose: "uncertain" },
    });
    await assert.rejects(
        h
            .pipeline()
            .infer(
                await h.storage.get("task"),
                "uncertain",
                "community/pollinations-ai/polli",
                [],
            ),
        /uncertain/,
    );
    assert.equal(h.counts.paid, 1);
});

test("candidate repair fast-forwards only its known parent and uncertain draft creation reconciles", async () => {
    const d = decision();
    const next = "c".repeat(40);
    const parent = "b".repeat(40);
    const state = {
        issue: 1,
        digest: "d".repeat(64),
        decision: d,
        parentCandidate: { sha: parent },
    };
    let ref = parent;
    let pr;
    let posts = 0;
    const requests = [];
    const github = {
        repository: "pollinations/pollinations",
        request: async (path, method = "GET", data) => {
            requests.push({ path, method, data });
            if (path.startsWith("/git/commits/"))
                return { tree: { sha: "tree" } };
            if (path === "/git/blobs") return { sha: "blob" };
            if (path === "/git/trees") return { sha: "newtree" };
            if (path === "/git/commits") return { sha: next };
            if (path.startsWith("/git/ref/heads/"))
                return { object: { sha: ref } };
            if (method === "PATCH") {
                assert.equal(data.force, false);
                ref = data.sha;
                return { object: { sha: ref } };
            }
            if (path === "/pulls") {
                posts++;
                pr = {
                    body: data.body,
                    draft: true,
                    state: "open",
                    head: { sha: ref },
                    base: { ref: "main" },
                };
                throw new Error("Transport disconnected after creation");
            }
            throw new Error(`Unexpected ${path}`);
        },
        list: async () => (pr ? [pr] : []),
    };
    const workspace = {
        changes: async () => [{ path: d.paths[0], content: "repaired bytes" }],
    };
    const saved = [];
    const save = async (s) => saved.push(structuredClone(s));
    state.candidate = await commitCandidate(github, workspace, state, save);
    assert.equal(
        requests.find((r) => r.path === "/git/commits").data.parents[0],
        parent,
    );
    assert.equal(ref, next);
    assert.ok(saved.some((s) => s.candidateIntent?.sha === next));
    state.verification = {
        sha: next,
        checks: d.checks.map((c) => ({ id: c.id, exitCode: 0 })),
    };
    assert.equal((await publishDraft(github, state, save)).head.sha, next);
    await publishDraft(github, state, save);
    assert.equal(posts, 1);
    ref = SHA;
    await assert.rejects(publishDraft(github, state, save), /changed/);
});

test("an uncertain comment write cannot be repeated when no remote receipt is visible", async () => {
    const h = harness();
    const github = createServices(h.storage, {
        GITHUB_TOKEN: "test-only",
    }).github;
    let posts = 0;
    github.fetcher = async (_url, options) => {
        if (options.method === "POST") {
            posts++;
            throw new Error("Unknown transport outcome");
        }
        return Response.json([]);
    };
    await assert.rejects(
        github.comment(1, "<!-- receipt -->", "status"),
        /transport/,
    );
    await assert.rejects(
        github.comment(1, "<!-- receipt -->", "status"),
        /reconciliation/,
    );
    assert.equal(posts, 1);
});
