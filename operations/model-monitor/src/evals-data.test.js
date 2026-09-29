import assert from "node:assert/strict";
import { test } from "node:test";

import {
    evalLeaderboard,
    normalizeEvalHistory,
    normalizeEvalRun,
    scoreDelta,
} from "./evals-data.js";

const RUN = {
    schema: 1,
    runId: "2026-09-28T05-00-00-000Z",
    startedAt: "2026-09-28T05:00:00.000Z",
    families: ["aiw", "aiw-plus", "bowls"],
    questionsPerFamily: 3,
    questionCount: 9,
    costPollen: 2.41,
    models: [
        {
            name: "openai/gpt-6-astra",
            community: false,
            aliases: ["gpt-6-astra"],
            score: 0.9,
            marginOfError: 0.1,
            correct: 8,
            total: 9,
            costPollen: 0.01,
            status: "scored",
        },
        {
            name: "community/Saauf/gpt-6-luna",
            community: true,
            aliases: [],
            score: 0.1,
            marginOfError: 0.1,
            correct: 1,
            total: 9,
            costPollen: 0,
            status: "scored",
        },
        {
            name: "community/vendouple/gpt-6-astra:stable",
            community: true,
            aliases: [],
            score: 0.5,
            marginOfError: 0.1,
            correct: 4,
            total: 9,
            costPollen: 0,
            status: "scored",
        },
    ],
};

test("normalizeEvalRun keeps a valid run and drops unscored models", () => {
    const run = normalizeEvalRun({
        ...RUN,
        models: [
            ...RUN.models,
            { name: "late/model", status: "over_cost_cap" },
        ],
    });
    assert.equal(run.scoredCount, 3);
    assert.equal(run.costPollen, 2.41);
    assert.equal(
        run.models.every((model) => model.community !== undefined),
        true,
    );
});

test("normalizeEvalRun rejects malformed data", () => {
    assert.equal(normalizeEvalRun(null), null);
    assert.equal(normalizeEvalRun({}), null);
    assert.equal(normalizeEvalRun({ models: [] }), null);
    assert.equal(
        normalizeEvalRun({
            models: [{ name: "x", score: "0.5", marginOfError: 0.1 }],
        }),
        null,
    );
});

test("leaderboard pairs community models under their official namesake", () => {
    const run = normalizeEvalRun(RUN);
    const rows = evalLeaderboard(run.models);
    assert.deepEqual(
        rows.map((row) => row.model.name),
        [
            "openai/gpt-6-astra",
            "community/Saauf/gpt-6-luna",
            "community/vendouple/gpt-6-astra:stable",
        ],
    );
    // Both community models are named after the official one and rank
    // directly beneath it, in pairing order (which follows the input
    // order of the community models).
    const stable = rows.find(
        (row) => row.model.name === "community/vendouple/gpt-6-astra:stable",
    );
    assert.equal(stable.paired.name, "openai/gpt-6-astra");
    assert.equal(stable.gap.significant, true);
    const luna = rows.find(
        (row) => row.model.name === "community/Saauf/gpt-6-luna",
    );
    assert.equal(luna.paired.name, "openai/gpt-6-astra");
    assert.equal(luna.gap.significant, true);
});

test("history normalizes and orders newest first", () => {
    const history = normalizeEvalHistory([
        {
            runId: "old",
            startedAt: "2026-09-21T05:00:00.000Z",
            costPollen: 2.1,
            scoredCount: 170,
            models: [{ name: "openai/gpt-6-astra", score: 0.7 }],
        },
        {
            runId: "new",
            startedAt: "2026-09-28T05:00:00.000Z",
            costPollen: 2.4,
            scoredCount: 180,
            models: [{ name: "openai/gpt-6-astra", score: 0.9 }],
        },
    ]);
    assert.equal(history[0].runId, "new");
    assert.equal(history.length, 2);
    assert.deepEqual(normalizeEvalHistory("junk"), []);
});

test("scoreDelta compares the two most recent runs", () => {
    const history = [
        { runId: "new", models: [{ name: "openai/gpt-6-astra", score: 0.9 }] },
        { runId: "old", models: [{ name: "openai/gpt-6-astra", score: 0.7 }] },
    ];
    assert.ok(Math.abs(scoreDelta(history, "openai/gpt-6-astra") - 0.2) < 1e-9);
    assert.equal(scoreDelta([history[0]], "openai/gpt-6-astra"), null);
    assert.equal(scoreDelta(history, "missing/model"), null);
});
