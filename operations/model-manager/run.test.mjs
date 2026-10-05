import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import {
    analyze,
    assessmentRequest,
    comparePublicPricing,
    dayKey,
    historySnapshot,
    reportIssue,
    researchEvidence,
    runRates,
    selectFindings,
    settleAssessment,
    textAssessmentCost,
    trendReasons,
} from "./analyze.mjs";
import { nextPage, query, request, rows } from "./collectors.mjs";

const day = (at, model) => ({
    at,
    sources: [{ source: "replicate", observations: [model] }],
});
const trend = (rank, task = null) => ({ kind: "trending", rank, task });

test("Only selected successful leads are suppressed; each day uses current evidence", () => {
    const at = "2026-10-05T06:00:00Z";
    const snapshot = {
        at,
        registry: [],
        liveCatalog: [],
        sources: [
            {
                source: "huggingface",
                observations: Array.from({ length: 7 }, (_, i) => ({
                    id: `lab/${i}`,
                    version: "old",
                    task: "text-generation",
                    signals: [trend(1)],
                })),
            },
        ],
    };
    const report = {
        ...snapshot,
        findings: analyze(snapshot, []),
        gaps: [],
        assessment: { status: "failed" },
    };
    report.assessmentInput = researchEvidence(report);
    assert.deepEqual(settleAssessment(report, {}), {});
    report.assessment.status = "complete";
    const notified = settleAssessment(report, {});
    assert.equal(Object.keys(notified).length, 5);
    assert.equal(selectFindings(analyze(snapshot, [], notified)).length, 2);
    const tomorrow = { ...snapshot, at: "2026-10-06T06:00:00Z", sources: [] };
    assert.deepEqual(
        selectFindings(analyze(tomorrow, [snapshot], notified)),
        [],
    );
    tomorrow.sources = [
        {
            source: "huggingface",
            observations: [
                { ...snapshot.sources[0].observations[0], version: "new" },
            ],
        },
    ];
    const selected = selectFindings(analyze(tomorrow, [snapshot], notified));
    assert.equal(selected.length, 1);
    assert.equal(selected[0].version, "new");
});

test("Discovery keeps two slots even when maintenance leads fill the report", () => {
    const findings = [
        ...Array.from({ length: 30 }, (_, i) => ({
            id: `retire-${i}`,
            kind: "retirement_review",
            newFinding: true,
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
            id: `discover-${i}`,
            kind: "investigate",
            newFinding: i !== 0,
        })),
    ];
    const selected = selectFindings(findings);
    assert.equal(selected.length, 5);
    assert.deepEqual(
        selected.map((f) => f.id),
        ["discover-1", "discover-2", "retire-0", "retire-1", "retire-2"],
    );
    assert.equal(selectFindings(findings.slice(0, 30)).length, 5);
    assert.equal(selectFindings(findings.slice(30)).length, 5);
});

test("Sourcing excludes existing routes, fee-only savings, mixed rates and unknown prices", () => {
    const snapshot = {
        at: "2026-10-05T06:00:00Z",
        liveCatalog: [],
        registry: [
            {
                name: "lab/model",
                provider: "direct",
                cost: { promptTextTokens: 2.11, completionTextTokens: 4.22 },
                public: { pricing: {} },
            },
        ],
        sources: [
            {
                source: "openrouter",
                observations: [
                    {
                        id: "lab/model",
                        signals: [],
                        pricing: { prompt: "2", completion: "4" },
                    },
                ],
            },
        ],
    };
    const model = snapshot.registry[0];
    const upstream = snapshot.sources[0].observations[0];
    const leads = (notified = {}) =>
        analyze(snapshot, [], notified).filter(
            (f) => f.kind === "sourcing_lead",
        );
    assert.equal(leads().length, 0); // Fee normalization removes the apparent discount.
    upstream.pricing.prompt = "1";
    upstream.pricing.completion = "5";
    assert.equal(leads().length, 0); // A cheaper input cannot hide dearer output.
    upstream.pricing.completion = "3";
    assert.equal(leads().length, 1);
    assert.equal(leads()[0].upstreamRates.completionTextTokens, 3 * 1.055);
    const first = leads()[0];
    const notified = { [first.fingerprint]: snapshot.at };
    assert.equal(leads(notified)[0].newFinding, false);
    model.cost.completionTextTokens = 5;
    assert.equal(leads(notified)[0].newFinding, true); // Changed checkout cost is fresh evidence.
    model.provider = "openrouter";
    assert.equal(leads().length, 0); // Headline minima cannot verify a pinned route.
    model.provider = "direct";
    model.costVariants = { long: { promptTextTokens: 3 } };
    assert.equal(leads().length, 0);
    delete model.costVariants;
    for (const price of [undefined, null, "", "unknown", "-1"]) {
        upstream.pricing.prompt = price;
        assert.equal(leads().length, 0);
    }
});

test("Research evidence supplies only a bounded relevant checkout inventory", () => {
    const report = {
        at: "2026-10-05T06:00:00Z",
        revision: "test",
        sources: [],
        gaps: Array.from({ length: 300 }, () => ({
            source: "replicate",
            label: "watchlist",
            status: "unavailable",
            error: "Source time budget exceeded",
        })),
        findings: [
            { newFinding: true, id: "lab/new", task: "text-generation" },
        ],
        registry: Array.from({ length: 20 }, (_, i) => ({
            name: `existing-${i}`,
            hidden: i === 0,
            public: {
                category: i === 1 ? "image" : "text",
                description: "capability ".repeat(40),
                capabilities: ["tools"],
            },
        })),
    };
    const input = researchEvidence(report);
    assert.equal(input.findings.length, 1);
    assert.equal(input.gaps[0].count, 300);
    assert.equal(input.gaps[0].examples.length, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(input)) < 12000);
    assert.equal(input.inventory.length, 6);
    assert.ok(
        input.inventory.every(
            (m) =>
                m.category === "text" &&
                m.id !== "existing-0" &&
                m.description.length <= 160,
        ),
    );
    report.findings[0].task = "unknown";
    assert.equal(researchEvidence(report).inventory.length, 0);
});

test("Source deadline cancels a stalled response body, preserves observations and skips further requests", async () => {
    let requests = 0;
    const server = createServer((req, res) => {
        requests++;
        res.setHeader("content-type", "application/json");
        if (req.url === "/stall") res.write('{"items":');
        else res.end('{"items":[{"id":"available", "signals":[]}]}');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const source = {
        observations: [],
        queries: [],
        signal: AbortSignal.timeout(200),
    };
    const load = async (path) =>
        JSON.parse((await request(`${url}${path}`, {}, source.signal)).text);
    try {
        await query(source, "fast", `${url}/fast`, () => load("/fast"));
        await query(source, "stalled", `${url}/stall`, () => load("/stall"));
        await query(source, "skipped", `${url}/skip`, () => load("/skip"));
        assert.equal(requests, 2);
        assert.equal(source.observations.length, 1);
        assert.deepEqual(
            source.queries.map((q) => q.status),
            ["complete", "unavailable", "unavailable"],
        );
        assert.equal(source.queries[1].error, "Source time budget exceeded");
        const other = { observations: [], queries: [] };
        await query(other, "healthy", `${url}/fast`, async () =>
            JSON.parse((await request(`${url}/fast`)).text),
        );
        assert.equal(other.observations.length, 1);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test("Prompt-agent runner bounds evidence and requests no caller instructions or tools", () => {
    const input = JSON.stringify({
        at: "2026-10-05T06:00:00Z",
        findings: [{ id: "lab/model" }],
        gaps: [],
    });
    assert.deepEqual(assessmentRequest(input, "private-agent"), {
        model: "private-agent",
        input,
        max_output_tokens: 1200,
        reasoning: { effort: "none" },
        store: false,
        stream: false,
    });
    for (const invalid of [
        "not JSON",
        JSON.stringify({ at: "invalid", findings: [{}], gaps: [] }),
        JSON.stringify({ at: "2026-10-05", findings: [], gaps: [] }),
        JSON.stringify({
            at: "2026-10-05",
            findings: Array(6).fill({}),
            gaps: [],
        }),
        JSON.stringify({
            at: "2026-10-05",
            findings: [{ description: "界".repeat(5000) }],
            gaps: [],
        }),
    ])
        assert.throws(() => assessmentRequest(invalid, "private-agent"));
});

test("Assessment reservation includes cache writes and rejects unbounded rates", () => {
    const model = {
        pricing: {
            currency: "pollen",
            promptTextTokens: 0.0000001,
            promptCacheWriteTokens: 0.000000125,
            completionTextTokens: 0.0000005,
        },
    };
    assert.equal(
        textAssessmentCost(model, 1000),
        2024 * 0.000000125 + 1200 * 0.0000005,
    );
    assert.equal(
        textAssessmentCost({ ...model, capabilities: ["web_search"] }, 1000),
        null,
    );
    assert.equal(
        textAssessmentCost(
            {
                ...model,
                pricing: { ...model.pricing, completionTextTokens: "unknown" },
            },
            1000,
        ),
        null,
    );
    assert.equal(textAssessmentCost(undefined, 1000), null);
});

test("Hugging Face persistence requires distinct consecutive daily observations", () => {
    const source = { source: "huggingface" };
    const model = { id: "lab/model", signals: [trend(35)] };
    const history = [
        {
            at: "2026-10-04T06:00:00Z",
            sources: [{ ...source, observations: [model] }],
        },
    ];
    assert.equal(
        trendReasons(source, model, [], "2026-10-05T06:00:00Z").length,
        0,
    );
    assert.equal(
        trendReasons(source, model, history, "2026-10-05T06:00:00Z").length,
        1,
    );
    assert.equal(
        trendReasons(source, model, history, "2026-10-04T07:00:00Z").length,
        0,
    );
    assert.equal(
        trendReasons(source, model, history, "2026-10-06T06:00:00Z").length,
        0,
    );
    assert.equal(
        trendReasons(
            source,
            { ...model, signals: [trend(5, "text-to-image")] },
            [],
            "2026-10-05T06:00:00Z",
        ).length,
        1,
    );
});

test("Replicate rates normalize elapsed time, require history and reject resets/gaps", () => {
    const at = "2026-10-05T06:00:00Z";
    const model = { id: "lab/model", runs: 1100 };
    const history = [
        day("2026-10-01T06:00:00Z", { ...model, runs: 400 }),
        day("2026-10-02T06:00:00Z", { ...model, runs: 500 }),
        day("2026-10-03T06:00:00Z", { ...model, runs: 600 }),
        day("2026-10-04T06:00:00Z", { ...model, runs: 700 }),
    ];
    assert.deepEqual(runRates(history, model, at), { rate: 400, growth: 4 });
    assert.deepEqual(runRates([], model, at), { rate: null, growth: null });
    assert.deepEqual(runRates(history, { ...model, runs: 5 }, at), {
        rate: null,
        growth: null,
    });
    assert.deepEqual(runRates(history, model, "2026-10-06T06:00:00Z"), {
        rate: null,
        growth: null,
    });
    assert.equal(runRates(history, model, "2026-10-05T12:00:00Z").rate, 320);
});

test("Pagination never forwards provider authorization to another origin", () => {
    assert.throws(() =>
        nextPage(
            "https://evil.example/page",
            "https://api.replicate.com/v1/models",
        ),
    );
    assert.equal(
        nextPage("?cursor=next", "https://api.replicate.com/v1/models"),
        "https://api.replicate.com/v1/models?cursor=next",
    );
    assert.throws(() => rows({ models: {} }, "models"));
});

test("Checkout/live price drift is a review finding, not proof of a billing defect", () => {
    const registry = [
        {
            name: "lab/model",
            public: {
                pricing: { currency: "pollen", promptTextTokens: "0.000001" },
            },
        },
    ];
    const live = [
        {
            name: "lab/model",
            pricing: { currency: "pollen", promptTextTokens: "0.000002" },
        },
    ];
    const findings = comparePublicPricing(registry, live);
    assert.equal(
        findings[0].verification,
        "revision_difference_not_confirmed_billing_defect",
    );
    assert.equal(
        comparePublicPricing(
            registry,
            registry.map((m) => ({ name: m.name, pricing: m.public.pricing })),
        ).length,
        0,
    );
});

test("Existing model revisions and changed price values reopen review", () => {
    const snapshot = {
        at: "2026-10-05T06:00:00Z",
        registry: [
            {
                name: "lab/model",
                aliases: [],
                public: { pricing: { promptTextTokens: 1 } },
            },
        ],
        liveCatalog: [{ name: "lab/model", pricing: { promptTextTokens: 2 } }],
        sources: [
            {
                source: "huggingface",
                observations: [
                    { id: "lab/model", version: "new", signals: [] },
                ],
            },
        ],
    };
    const history = [
        {
            at: "2026-10-04T06:00:00Z",
            sources: [
                {
                    source: "huggingface",
                    observations: [
                        { id: "lab/model", version: "old", signals: [] },
                    ],
                },
            ],
        },
    ];
    const first = analyze(snapshot, history);
    assert.ok(first.some((f) => f.kind === "model_review"));
    const price = first.find((f) => f.kind === "pricing_review");
    const notified = { [price.fingerprint]: snapshot.at };
    assert.equal(
        analyze(snapshot, history, notified).find(
            (f) => f.kind === "pricing_review",
        ).newFinding,
        false,
    );
    snapshot.liveCatalog[0].pricing.promptTextTokens = 3;
    assert.equal(
        analyze(snapshot, history, notified).find(
            (f) => f.kind === "pricing_review",
        ).newFinding,
        true,
    );
});

test("Berlin day keys respect the daylight-saving boundary", () => {
    assert.equal(dayKey("2026-10-24T22:30:00Z"), "2026-10-25");
    assert.equal(dayKey("2026-10-25T22:30:00Z"), "2026-10-25");
});

test("Partial or missing source days do not rediscover known identities or hide revisions", () => {
    const model = {
        id: "lab/model",
        version: "a",
        signals: [{ kind: "catalog" }],
    };
    const snapshot = {
        at: "2026-10-05T06:00:00Z",
        registry: [],
        liveCatalog: [],
        sources: [{ source: "fal", observations: [model] }],
    };
    const history = [
        { ...snapshot, at: "2026-10-03T06:00:00Z" },
        {
            at: "2026-10-04T06:00:00Z",
            sources: [
                {
                    source: "fal",
                    status: "partial",
                    observations: [],
                    queries: [],
                },
            ],
        },
    ];
    assert.deepEqual(analyze(snapshot, history), []);
    const changed = {
        ...snapshot,
        sources: [
            { source: "fal", observations: [{ ...model, version: "b" }] },
        ],
    };
    assert.match(analyze(changed, history)[0].reasons[0], /revision changed/);
    const unknown = {
        ...snapshot,
        sources: [
            { source: "fal", observations: [{ ...model, id: "lab/unknown" }] },
        ],
    };
    assert.match(
        analyze(unknown, history)[0].reasons[0],
        /First observed.*coverage may be incomplete/,
    );
    assert.deepEqual(
        analyze(snapshot, [history[0], { at: history[1].at, sources: [] }]),
        [],
    );
});

test("Compact history preserves trend and revision decisions without catalog or schema copies", () => {
    const model = {
        id: "lab/model",
        runs: 1100,
        version: "new",
        signals: [{ kind: "catalog" }],
        inputSchema: { large: "unused" },
    };
    const snapshot = {
        at: "2026-10-05T06:00:00Z",
        registry: [],
        liveCatalog: [],
        sources: [{ source: "replicate", observations: [model] }],
    };
    const history = [400, 500, 600, 700].map((runs, index) => ({
        ...snapshot,
        at: `2026-10-0${index + 1}T06:00:00Z`,
        sources: [
            {
                source: "replicate",
                observations: [{ ...model, runs, version: "old" }],
            },
        ],
    }));
    assert.deepEqual(
        analyze(snapshot, history.map(historySnapshot)),
        analyze(snapshot, history),
    );
    const compact = historySnapshot(snapshot);
    assert.equal(compact.registry, undefined);
    assert.equal(compact.sources[0].observations[0].inputSchema, undefined);
});

test("Public issue includes escaped assessment while excluding private metadata and diagnostics", () => {
    const report = {
        at: "2026-10-05",
        account: "private@example.com",
        keyBudgetBefore: 5,
        sources: [
            { source: "fal", status: "partial", observations: [], queries: [] },
        ],
        gaps: [
            {
                source: "fal",
                label: "catalog-11",
                status: "unavailable",
                privateValue: "private-detail",
                error: "private-diagnostic",
            },
        ],
        assessment: {
            status: "complete",
            text: "ASSESSMENT_TEXT </pre><script>evil()</script>",
            usage: { privateValue: "private-usage" },
        },
        findings: Array.from({ length: 7 }, (_, index) => ({
            id: index === 1 ? "<script>source()</script>" : `lead-${index}`,
            kind: "investigate",
            newFinding: index !== 0,
            reason: "<img onerror=evil()>",
            url: "javascript:evil()",
        })),
    };
    const issue = reportIssue(report);
    assert.match(
        issue,
        /New leads: 6 · Already recorded: 1 · Coverage gaps: 1/,
    );
    assert.match(issue, /catalog-11/);
    assert.ok(!issue.includes("lead-0"));
    assert.ok(issue.includes("lead-5"));
    assert.ok(!issue.includes("lead-6"));
    assert.ok(!issue.includes("private@example.com"));
    assert.ok(!issue.includes("private-detail"));
    assert.ok(issue.includes("ASSESSMENT_TEXT"));
    assert.match(issue, /Agent assessment · complete/);
    assert.match(issue, /&lt;\/pre&gt;&lt;script&gt;/);
    for (const value of [
        "private@example.com",
        "private-detail",
        "private-diagnostic",
        "private-usage",
        "<script>",
    ])
        assert.ok(!issue.includes(value));
    assert.ok(!issue.includes("<script>"));
    assert.ok(!issue.includes('href="javascript:'));
    assert.match(issue, /&lt;img/);
});

test("A missing Replicate collection day does not repeat the editorial seed", () => {
    const model = { id: "lab/model", signals: [{ kind: "collection" }] };
    const history = [
        day("2026-10-03T06:00:00Z", model),
        {
            at: "2026-10-04T06:00:00Z",
            sources: [{ source: "replicate", observations: [] }],
        },
    ];
    assert.deepEqual(
        trendReasons(
            { source: "replicate" },
            model,
            history,
            "2026-10-05T06:00:00Z",
        ),
        [],
    );
});
