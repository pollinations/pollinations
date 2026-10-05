import assert from "node:assert/strict";
import { test } from "node:test";
import {
    analyze,
    comparePublicPricing,
    dayKey,
    historySnapshot,
    reportDigest,
    reportHtml,
    reportIssue,
    runRates,
    textAssessmentCost,
    trendReasons,
} from "./analyze.mjs";
import { nextPage, rows } from "./collectors.mjs";

const day = (at, model) => ({
    at,
    sources: [{ source: "replicate", observations: [model] }],
});
const trend = (rank, task = null) => ({ kind: "trending", rank, task });

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

test("Repeat suppression persists but material model revisions reopen research", () => {
    const snapshot = {
        at: "2026-10-05T06:00:00Z",
        registry: [],
        liveCatalog: [],
        sources: [
            {
                source: "huggingface",
                observations: [
                    { id: "lab/model", version: "a", signals: [trend(1)] },
                ],
            },
        ],
    };
    const first = analyze(snapshot, []);
    const notified = { [first[0].fingerprint]: snapshot.at };
    assert.equal(analyze(snapshot, [], notified)[0].newFinding, false);
    snapshot.sources[0].observations[0].version = "b";
    assert.equal(analyze(snapshot, [], notified)[0].newFinding, true);
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

test("Reports escape source markup and reject executable URLs", () => {
    const html = reportHtml({
        at: "now",
        sources: [],
        findings: [
            {
                id: "<script>evil()</script>",
                url: "javascript:evil()",
                reason: "<img onerror=evil()>",
                newFinding: true,
            },
        ],
        gaps: [],
    });
    assert.ok(!html.includes("<script>evil()"));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(html.includes("&lt;img"));
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
            id: `lead-${index}`,
            kind: "investigate",
            newFinding: index !== 0,
            reason: "<img onerror=evil()>",
            url: "javascript:evil()",
        })),
    };
    const digest = reportDigest(report);
    assert.match(
        digest,
        /New leads: 6 · Already recorded: 1 · Coverage gaps: 1/,
    );
    assert.match(digest, /catalog-11/);
    assert.ok(!digest.includes("lead-0"));
    assert.ok(digest.includes("lead-5"));
    assert.ok(!digest.includes("lead-6"));
    assert.ok(!digest.includes("private@example.com"));
    assert.ok(!digest.includes("private-detail"));
    assert.ok(!digest.includes("ASSESSMENT_TEXT"));
    const issue = reportIssue(report);
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
    assert.ok(reportHtml(report).includes("ASSESSMENT_TEXT"));
    assert.ok(!digest.includes("<script>"));
    assert.ok(!digest.includes('href="javascript:'));
    assert.match(digest, /&lt;img/);
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
