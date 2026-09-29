import assert from "node:assert/strict";
import { test } from "node:test";
import {
    EVALS_BRANCH,
    evalFileUrls,
    fetchEvalsData,
    formatBalanceRun,
    formatCost,
    formatGap,
    formatMargin,
    formatScore,
    formatSignedPercent,
    formatWhen,
    latestRunTop,
    pairSeverity,
    parseEvalHistory,
    parseEvalReport,
    rankingWithPairs,
} from "./evals-data.js";

function row(name, overrides = {}) {
    return {
        rank: 1,
        name,
        title: name,
        scope: name.startsWith("community/") ? "community" : "official",
        specialized: false,
        publisher: "test",
        health: "healthy",
        status: "scored",
        score: 1,
        correct: 3,
        asked: 3,
        planned: 3,
        marginOfError: 0.3,
        interval: [0.7, 1],
        families: {},
        costPollen: 0.0001,
        costKnown: true,
        avgLatencyMs: 1200,
        failures: 0,
        rateLimited: 0,
        timeouts: 0,
        formatted: 3,
        truncated: 0,
        ...overrides,
    };
}

function report(overrides = {}) {
    return {
        schema: 1,
        eval: {
            id: "aiw",
            title: "Alice in Wonderland",
            description: "d",
            version: 1,
            source: "LAION AIW",
            families: ["aiw", "aiwplus", "bowls"],
        },
        run: {
            id: "2026-09-29T06:00:00.000Z",
            evalId: "aiw",
            evalTitle: "Alice in Wonderland",
            startedAt: "2026-09-29T06:00:00.000Z",
            generatedAt: "2026-09-29T06:00:20.000Z",
            durationSec: 20,
            seed: 42,
            questionsPerFamily: 3,
            questionsPerModel: 9,
            questionsTotal: 27,
            modelCount: 3,
            scoredModels: 2,
            askedQuestions: 18,
            costPollen: 0.0043,
            budgetPollen: 20,
            maxCostPerModel: 1,
            maxTokens: 400,
            concurrency: 6,
            timeoutMs: 90000,
            balanceBefore: 86.81695288,
            balanceAfter: 86.8126,
            baseUrl: "https://gen.pollinations.ai",
        },
        ranking: [
            row("official/best", { rank: 1, score: 1, correct: 3 }),
            row("community/Saauf/gpt-6-luna", {
                rank: 2,
                score: 0.666,
                correct: 2,
                interval: [0.375, 0.875],
            }),
        ],
        notRun: [
            { name: "community/Creatneworld/pen", reason: "cost cap reached" },
        ],
        pairs: [
            {
                community: "community/Saauf/gpt-6-luna",
                official: "openai/gpt-6-luna",
                match: "exact",
                communityScore: 0.666,
                communityAsked: 3,
                communityMargin: 0.3,
                officialScore: 1,
                officialAsked: 3,
                officialMargin: 0.28,
                gap: -0.334,
                marginOfError: 0.41,
                exceedsMargin: false,
            },
        ],
        costUnknownModels: [],
        ...overrides,
    };
}

test("the report is read from the news branch", () => {
    const urls = evalFileUrls();
    assert.equal(EVALS_BRANCH, "news");
    assert.equal(
        urls.latest,
        "https://raw.githubusercontent.com/pollinations/pollinations/news/operations/model-evals/latest.json",
    );
    assert.equal(urls.history.endsWith("history.json"), true);
});

test("parseEvalReport keeps the run, ranking and pairs", () => {
    const parsed = parseEvalReport(report());
    assert.equal(parsed.evalTitle, "Alice in Wonderland");
    assert.equal(parsed.seed, 42);
    assert.equal(parsed.scoredModels, 2);
    assert.equal(parsed.askedQuestions, 18);
    assert.equal(parsed.correctTotal, 5);
    assert.equal(parsed.balanceBefore, 86.81695288);
    assert.equal(parsed.ranking[1].scoreLower, 0.375);
    assert.equal(parsed.ranking[1].scope, "community");
    assert.equal(parsed.pairs[0].exceedsMargin, false);
    assert.equal(parsed.notRun[0].reason, "cost cap reached");
    assert.deepEqual(parsed.families, ["aiw", "aiwplus", "bowls"]);
});

test("parseEvalReport counts failures as wrong answers", () => {
    const parsed = parseEvalReport(
        report({
            ranking: [
                row("community/SlowPoke/slow", {
                    score: 0,
                    correct: 0,
                    asked: 3,
                    failures: 1,
                    timeouts: 2,
                    status: "partial",
                }),
            ],
        }),
    );
    assert.equal(parsed.ranking[0].failures, 3);
    assert.equal(parsed.ranking[0].correct, 0);
});

test("parseEvalReport rejects a report it cannot read", () => {
    assert.equal(parseEvalReport(null), null);
    assert.equal(parseEvalReport({}), null);
    assert.equal(parseEvalReport({ run: {} }), null);
    assert.equal(parseEvalReport({ run: {}, ranking: [] }), null);
    assert.equal(parseEvalReport({ run: {}, ranking: [{ name: "x" }] }), null);
});

test("rankingWithPairs puts a clone under its official model", () => {
    const parsed = parseEvalReport(
        report({
            ranking: [
                row("openai/gpt-6-luna", { rank: 1, score: 1 }),
                row("community/Saauf/gpt-6-luna", { rank: 2, score: 0.5 }),
                row("moonshotai/kimi-k3", { rank: 3, score: 0.4 }),
            ],
        }),
    );
    const rows = rankingWithPairs(parsed);
    assert.deepEqual(
        rows.map((entry) => [entry.row.name, entry.indent]),
        [
            ["openai/gpt-6-luna", 0],
            ["community/Saauf/gpt-6-luna", 1],
            ["moonshotai/kimi-k3", 0],
        ],
    );
    assert.equal(rows[0].pair, null);
    assert.equal(rows[1].pair.official, "openai/gpt-6-luna");
});

test("rankingWithPairs keeps a clone whose official model was not scored", () => {
    const parsed = parseEvalReport(
        report({
            ranking: [row("community/Saauf/gpt-6-luna", { score: 0.5 })],
            pairs: [
                {
                    community: "community/Saauf/gpt-6-luna",
                    official: "openai/gpt-6-luna",
                    match: "exact",
                    gap: -0.5,
                    marginOfError: 0.3,
                    exceedsMargin: true,
                },
            ],
        }),
    );
    const rows = rankingWithPairs(parsed);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].indent, 1);
    assert.equal(pairSeverity(rows[0].pair), "danger");
});

test("pairSeverity only flags a gap that beats the margin", () => {
    assert.equal(pairSeverity(null), "neutral");
    assert.equal(pairSeverity({ exceedsMargin: false }), "neutral");
    assert.equal(pairSeverity({ exceedsMargin: true, gap: -0.3 }), "danger");
    assert.equal(pairSeverity({ exceedsMargin: true, gap: 0.3 }), "success");
});

test("parseEvalHistory keeps the runs newest first", () => {
    const history = parseEvalHistory({
        updatedAt: "2026-10-06T06:00:00.000Z",
        runs: [
            {
                id: "2026-10-06T06:00:00.000Z",
                evalId: "aiw",
                startedAt: "2026-10-06T06:00:00.000Z",
                costPollen: 0.002,
                scoredModels: 3,
                askedQuestions: 27,
                ranking: [row("openai/gpt-6-luna")],
            },
            { id: "", ranking: [] },
        ],
    });
    assert.equal(history.runs.length, 1);
    assert.equal(history.runs[0].modelCount, 3);
    assert.equal(latestRunTop(history).leader.name, "openai/gpt-6-luna");
    assert.equal(latestRunTop({ runs: [] }), null);
    assert.equal(parseEvalHistory(null), null);
});

test("formatting keeps the numbers honest", () => {
    assert.equal(formatScore(0.3333), "33.3%");
    assert.equal(formatScore(null), "-");
    assert.equal(formatMargin(0.3012), "±30.1%");
    assert.equal(formatSignedPercent(-0.334), "-33.4%");
    assert.equal(formatSignedPercent(0.334), "+33.4%");
    assert.equal(formatGap(null), "-");
    assert.equal(formatCost(0.000091), "0.000091");
    assert.equal(formatCost(0.0043), "0.0043");
    assert.equal(formatCost(0), "0");
    assert.equal(formatCost(1, false), "unknown");
});

test("formatWhen and formatBalanceRun describe the run", () => {
    assert.equal(
        formatWhen("2026-09-29T06:00:20.000Z"),
        "2026-09-29 06:00 UTC",
    );
    assert.equal(formatWhen("nope"), "-");
    assert.equal(formatWhen(""), "-");
    assert.equal(
        formatBalanceRun({ balanceBefore: 86.81695288, balanceAfter: 86.8126 }),
        "86.817 → 86.813 pollen",
    );
    assert.equal(
        formatBalanceRun({ balanceBefore: null, balanceAfter: null }),
        "-",
    );
    assert.equal(formatBalanceRun(null), "-");
});

test("fetchEvalsData reads both files", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.endsWith("latest.json")) {
            return { ok: true, status: 200, json: async () => report() };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                updatedAt: "2026-09-29T06:00:00.000Z",
                runs: [
                    {
                        id: "2026-09-29T06:00:00.000Z",
                        ranking: [row("openai/gpt-6-luna")],
                    },
                ],
            }),
        };
    };
    const data = await fetchEvalsData(fetchImpl);
    assert.equal(data.error, null);
    assert.equal(data.published, true);
    assert.equal(data.report.seed, 42);
    assert.equal(data.history.runs.length, 1);
    assert.equal(calls.length, 2);
});

test("fetchEvalsData treats a missing report as an empty tab", async () => {
    const data = await fetchEvalsData(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
    }));
    assert.equal(data.report, null);
    assert.equal(data.history, null);
    assert.equal(data.error, null);
    assert.equal(data.published, false);
});

test("fetchEvalsData reports a broken report", async () => {
    const serverError = await fetchEvalsData(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
    }));
    assert.match(serverError.error, /HTTP 500/);

    const badJson = await fetchEvalsData(async () => ({
        ok: true,
        status: 200,
        json: async () => {
            throw new Error("Unexpected token < in JSON\nat position 0");
        },
    }));
    assert.match(badJson.error, /Unexpected token < in JSON/);
    assert.equal(badJson.published, false);

    const rejected = await fetchEvalsData(async () => {
        throw new Error("network down");
    });
    assert.equal(rejected.report, null);
    assert.equal(rejected.error, null);
});
