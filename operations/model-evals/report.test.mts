import assert from "node:assert/strict";
import { test } from "node:test";

import type { EvalQuestion } from "./src/eval.mts";
import {
    appendHistory,
    buildHistoryEntry,
    buildPairs,
    buildReport,
    HISTORY_LIMIT,
    type ModelResult,
    type RunReport,
    type RunResult,
    renderLeaderboard,
} from "./src/report.mts";
import { scoreFor } from "./src/stats.mts";

function modelResult(
    name: string,
    correct: number,
    asked: number,
    fields: Partial<ModelResult> = {},
): ModelResult {
    const score = scoreFor(correct, asked);
    return {
        name,
        title: name,
        publisher: "test",
        community: name.startsWith("community/"),
        specialized: false,
        health: "healthy",
        score,
        families: { aiw: scoreFor(correct, asked) },
        outcomes: [],
        planned: asked,
        asked,
        notAsked: 0,
        failures: 0,
        rateLimited: 0,
        timeouts: 0,
        formatted: asked,
        truncated: 0,
        costPollen: 0,
        costKnown: true,
        avgLatencyMs: 1200,
        status: asked > 0 ? "scored" : "not_run",
        stopReason: null,
        ...fields,
    };
}

function questions(count: number): EvalQuestion[] {
    return Array.from({ length: count }, (_value, index) => ({
        id: `q${index}`,
        family: "aiw",
        variant: "test",
        prompt: "p",
        expectedAnswer: 1,
        answerFormat: "number" as const,
        meta: {},
    }));
}

function runResult(
    models: ModelResult[],
    fields: Partial<RunResult> = {},
): RunResult {
    return {
        evalDefinition: {
            id: "aiw",
            title: "Alice in Wonderland",
            description: "desc",
            version: 1,
            source: "source",
            families: ["aiw", "aiwplus", "bowls"],
            questions: () => [],
            grade: () => ({ ok: false, answer: null, formatted: false }),
        },
        questions: questions(9),
        models,
        notRun: [],
        costPollen: 0.0043,
        costUnknownModels: [],
        balanceBefore: 86.81695288,
        balanceAfter: 86.8126,
        seed: 1234,
        questionsPerFamily: 3,
        concurrency: 6,
        budgetPollen: 20,
        maxCostPerModel: 1,
        maxTokens: 400,
        timeoutMs: 90000,
        startedAt: "2026-09-29T06:00:00.000Z",
        durationSec: 42.4,
        ...fields,
    };
}

test("buildReport carries the schema, eval metadata and run budget", () => {
    const report = buildReport(
        runResult([modelResult("openai/gpt-6-luna", 9, 9)]),
        {
            generatedAt: "2026-09-29T06:01:00.000Z",
            baseUrl: "https://gen.pollinations.ai",
        },
    );
    assert.equal(report.schema, 1);
    assert.equal(report.eval.id, "aiw");
    assert.deepEqual(report.eval.families, ["aiw", "aiwplus", "bowls"]);
    assert.equal(report.run.id, "2026-09-29T06:00:00.000Z");
    assert.equal(report.run.questionsPerModel, 9);
    assert.equal(report.run.questionsTotal, 9);
    assert.equal(report.run.scoredModels, 1);
    assert.equal(report.run.costPollen, 0.0043);
    assert.equal(report.run.budgetPollen, 20);
    assert.equal(report.run.timeoutMs, 90000);
    assert.equal(report.run.baseUrl, "https://gen.pollinations.ai");
});

test("ranking drops unscored models, sorts by score and shares ranks on ties", () => {
    const report = buildReport(
        runResult([
            modelResult("community/low", 0, 9),
            modelResult("openai/high", 9, 9, {
                costPollen: 0.0004,
                costKnown: true,
            }),
            modelResult("openai/tie-a", 9, 9),
            modelResult("openai/tie-b", 9, 9),
            modelResult("community/never-asked", 0, 0, {
                status: "not_run",
                planned: 9,
                stopReason: "would exceed budget",
            }),
        ]),
    );
    assert.deepEqual(
        report.ranking.map((row) => [row.rank, row.name]),
        [
            [1, "openai/high"],
            [1, "openai/tie-a"],
            [1, "openai/tie-b"],
            [4, "community/low"],
        ],
    );
    assert.equal(report.ranking[0].scope, "official");
    assert.equal(report.ranking[3].scope, "community");
    assert.equal(report.ranking[0].correct, 9);
    assert.equal(report.ranking[0].marginOfError > 0, true);
    assert.deepEqual(report.ranking[0].interval.length, 2);
});

test("pairs highlight a community gap that is bigger than its margin of error", () => {
    const pairs = buildPairs([
        modelResult("openai/gpt-6-luna", 6, 9),
        modelResult("community/Saauf/gpt-6-luna", 9, 9),
        modelResult("openai/gpt-5.6-luna", 7, 9),
        modelResult("community/AkshayCoder48/gpt-5-6-luna", 6, 9),
        modelResult("community/Unrelated/thing", 3, 9),
    ]);
    assert.equal(pairs.length, 2);
    const clone = pairs.find(
        (pair) => pair.community === "community/Saauf/gpt-6-luna",
    );
    assert.ok(clone);
    assert.equal(clone.official, "openai/gpt-6-luna");
    assert.equal(clone.match, "exact");
    assert.equal(clone.exceedsMargin, true);
    assert.ok(Math.abs(clone.gap - 1 / 3) < 1e-3);
    assert.ok(clone.marginOfError > 0 && clone.marginOfError < 0.5);

    const close = pairs.find(
        (pair) => pair.community === "community/AkshayCoder48/gpt-5-6-luna",
    );
    assert.ok(close);
    assert.equal(close.exceedsMargin, false);
});

test("pairs ignore models that were not scored", () => {
    const pairs = buildPairs([
        modelResult("openai/gpt-6-luna", 0, 0, { status: "not_run" }),
        modelResult("community/Saauf/gpt-6-luna", 9, 9),
    ]);
    assert.deepEqual(pairs, []);
});

test("renderLeaderboard prints the ranking, the pairs, the skipped models and the cost", () => {
    const report = buildReport(
        runResult(
            [
                modelResult("openai/gpt-6-luna", 9, 9, {
                    costPollen: 0.000027,
                }),
                modelResult("community/Saauf/gpt-6-luna", 6, 9, {
                    costPollen: 0.000064,
                }),
                modelResult("community/Creatneworld/pen", 3, 9, {
                    status: "partial",
                    notAsked: 6,
                    stopReason: "cost cap of 1 pollen reached",
                    costKnown: false,
                }),
            ],
            {
                notRun: [
                    {
                        name: "openai/expensive",
                        reason: "would exceed the 20 pollen budget",
                    },
                ],
                costUnknownModels: ["community/Creatneworld/pen"],
            },
        ),
        {
            generatedAt: "2026-09-29T06:01:00.000Z",
            baseUrl: "https://gen.pollinations.ai",
        },
    );
    const text = renderLeaderboard(report);
    assert.match(text, /Model evals — Alice in Wonderland \(aiw\)/);
    assert.match(text, /openai\/gpt-6-luna/);
    assert.match(text, /100\.0%/);
    assert.match(text, /9\/9/);
    assert.match(text, /~ community\/Creatneworld\/pen/);
    assert.match(text, /n\/a/);
    assert.match(text, /Community models named after an official model:/);
    assert.match(text, /! community\/Saauf\/gpt-6-luna/);
    assert.match(text, /gap/);
    assert.match(text, /Not run \(1\):/);
    assert.match(text, /openai\/expensive: would exceed the 20 pollen budget/);
    assert.match(
        text,
        /3\/3 models · 27\/27 questions answered · 0\.004300 pollen of a 20 pollen budget/,
    );
    assert.match(text, /seed 1234/);
    assert.match(text, /balance 86\.816953 → 86\.812600 pollen/);
    assert.match(
        text,
        /Cost unknown \(no published price\): community\/Creatneworld\/pen/,
    );
});

test("history keeps one year of weekly runs, newest first", () => {
    const first = buildReport(
        runResult([modelResult("openai/gpt-6-luna", 9, 9)]),
        {
            generatedAt: "2026-09-29T06:01:00.000Z",
        },
    );
    let history = appendHistory(null, buildHistoryEntry(first), {
        updatedAt: "2026-09-29T06:01:00.000Z",
    });
    assert.equal(history.schema, 1);
    assert.equal(history.runs.length, 1);

    // Re-publishing the same run replaces it instead of duplicating it.
    history = appendHistory(history, buildHistoryEntry(first));
    assert.equal(history.runs.length, 1);

    const second = buildReport(
        runResult([modelResult("openai/gpt-6-luna", 6, 9)], {
            startedAt: "2026-10-06T06:00:00.000Z",
        }),
        {
            generatedAt: "2026-10-06T06:01:00.000Z",
        },
    );
    history = appendHistory(history, buildHistoryEntry(second));
    assert.deepEqual(
        history.runs.map((entry) => entry.id),
        ["2026-10-06T06:00:00.000Z", "2026-09-29T06:00:00.000Z"],
    );
    assert.equal(history.runs[0].ranking[0].correct, 6);
    assert.equal(history.runs[0].ranking[0].asked, 9);
    assert.equal(history.updatedAt, "2026-10-06T06:01:00.000Z");

    const capped = appendHistory(history, buildHistoryEntry(first), {
        limit: 2,
    });
    assert.equal(capped.runs.length, 2);
    assert.equal(HISTORY_LIMIT, 52);
});

test("a report with nothing scored still renders", () => {
    const report = buildReport(runResult([], { costPollen: 0 }), {
        generatedAt: "2026-09-29T06:01:00.000Z",
    });
    const text = renderLeaderboard(report);
    assert.match(text, /\(no model was scored\)/);
});

test("RunReport stays serialisable", () => {
    const report: RunReport = buildReport(
        runResult([modelResult("openai/gpt-6-luna", 9, 9)]),
        {},
    );
    const parsed = JSON.parse(JSON.stringify(report)) as RunReport;
    assert.deepEqual(parsed, report);
});
