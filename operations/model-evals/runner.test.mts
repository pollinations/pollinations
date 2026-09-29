import assert from "node:assert/strict";
import { test } from "node:test";

import { aiwEval } from "./evals/aiw.mts";
import { runEval } from "./src/runner.mts";
import {
    COST_PER_QUESTION,
    createFakeServer,
    FREE_PRICING,
    fakeClock,
    modelFixture as model,
    noopLog,
    noopSleep,
} from "./test-helpers.mts";

const OFFICIAL = model("openai/gpt-6-luna", {
    supportedParameters: ["seed", "max_tokens"],
});
const CLONE = model("community/Saauf/gpt-6-luna");
const WRONG = model("openai/gpt-5.4-nano", {
    supportedParameters: ["max_tokens"],
});
const ERRORING = model("community/Creatneworld/pen");
const LIMITED = model("community/Scriptsnsenses/kimi-k3-free");
const SLOW = model("community/SlowPoke/very-slow");
const FREE = model("community/Catniti/catniti-ai-agent", {
    pricing: FREE_PRICING,
});

function find(models: { name: string }[], name: string) {
    const found = models.find((entry) => entry.name === name);
    assert.ok(found, `missing model ${name}`);
    return found;
}

test("scores a perfect model at 100% and a wrong model at 0%", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL, CLONE, WRONG, FREE],
        apiKey: "k",
        questionsPerFamily: 2,
        seed: 5,
        concurrency: 4,
        fetchImpl: createFakeServer({
            behaviors: { [WRONG.name]: "wrong" },
            bodies,
        }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    assert.equal(result.questions.length, 6);
    const perfect = find(result.models, OFFICIAL.name);
    assert.equal(perfect.score.score, 1);
    assert.equal(perfect.score.asked, 6);
    assert.equal(perfect.correct ?? perfect.score.correct, 6);
    assert.equal(perfect.formatted, 6);
    assert.equal(perfect.status, "scored");
    assert.equal(perfect.notAsked, 0);
    assert.ok(
        Math.abs(perfect.costPollen - 6 * COST_PER_QUESTION) < 1e-12,
        `${perfect.costPollen}`,
    );
    assert.ok(perfect.avgLatencyMs > 0);

    const wrong = find(result.models, WRONG.name);
    assert.equal(wrong.score.score, 0);
    assert.equal(wrong.score.correct, 0);
    assert.equal(wrong.score.asked, 6);
    assert.equal(wrong.failures + wrong.rateLimited + wrong.timeouts, 0);
    assert.equal(wrong.outcomes[0].formatted, true);

    const free = find(result.models, FREE.name);
    assert.equal(free.score.score, 1);
    assert.equal(free.costPollen, 0);
    assert.equal(free.costKnown, false);
    assert.deepEqual(result.costUnknownModels, [FREE.name]);

    assert.equal(result.models.length, 4);
    assert.equal(result.notRun.length, 0);
    const expected = 6 * COST_PER_QUESTION * 3;
    assert.ok(
        Math.abs(result.costPollen - expected) < 1e-12,
        `${result.costPollen} vs ${expected}`,
    );
    assert.equal(
        result.models.reduce((sum, entry) => sum + entry.asked, 0),
        24,
    );
});

test("counts errors, rate limits and timeouts as failed questions", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [ERRORING, LIMITED, SLOW],
        apiKey: "k",
        questionsPerFamily: 1,
        seed: 11,
        concurrency: 3,
        timeoutMs: 5,
        fetchImpl: createFakeServer({
            behaviors: {
                [ERRORING.name]: "error",
                [LIMITED.name]: "rate_limited",
                [SLOW.name]: "timeout",
            },
            bodies,
        }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    assert.equal(result.questions.length, 3);
    const erroring = find(result.models, ERRORING.name);
    assert.equal(erroring.score.asked, 3);
    assert.equal(erroring.score.score, 0);
    assert.equal(erroring.failures, 3);
    assert.equal(erroring.outcomes[0].errorMessage, "provider exploded");
    assert.equal(erroring.status, "scored");

    const limited = find(result.models, LIMITED.name);
    assert.equal(limited.rateLimited, 3);
    assert.equal(limited.failures, 0);
    assert.equal(limited.score.score, 0);

    const slow = find(result.models, SLOW.name);
    assert.equal(slow.timeouts, 3);
    assert.match(String(slow.outcomes[0].errorMessage), /timed out/);

    // Nothing was silently dropped: every model kept every question on the record.
    assert.equal(
        result.models.reduce((sum, entry) => sum + entry.asked, 0),
        9,
    );
});

test("stops a model once it reaches the per-model cost cap", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL],
        apiKey: "k",
        questionsPerFamily: 3,
        seed: 7,
        maxCostPerModel: COST_PER_QUESTION * 1.5,
        fetchImpl: createFakeServer({ behaviors: {}, bodies }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    const entry = find(result.models, OFFICIAL.name);
    assert.equal(entry.status, "partial");
    assert.equal(entry.asked, 2);
    assert.equal(entry.notAsked, 7);
    assert.match(String(entry.stopReason), /cost cap/);
    assert.ok(entry.costPollen >= COST_PER_QUESTION * 1.5 - 1e-12);
});

test("skips models that no longer fit the run budget", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL, CLONE, WRONG],
        apiKey: "k",
        questionsPerFamily: 1,
        seed: 3,
        concurrency: 1,
        pollenBudget: 1e-9,
        fetchImpl: createFakeServer({ behaviors: {}, bodies }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    assert.equal(result.models.length, 1);
    assert.equal(result.notRun.length, 2);
    for (const skipped of result.notRun) {
        assert.match(skipped.reason, /budget/);
    }
});

test("only sends a token cap to the models that advertise one", async () => {
    const bodies: Record<string, unknown>[] = [];
    await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL, CLONE],
        apiKey: "k",
        questionsPerFamily: 1,
        seed: 13,
        maxTokens: 400,
        fetchImpl: createFakeServer({ behaviors: {}, bodies }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    const officialBodies = bodies.filter(
        (body) => body.model === OFFICIAL.name,
    );
    const cloneBodies = bodies.filter((body) => body.model === CLONE.name);
    assert.equal(officialBodies.length, 3);
    assert.equal(cloneBodies.length, 3);
    for (const body of officialBodies) {
        assert.equal(body.max_tokens, 400);
    }
    for (const body of cloneBodies) {
        assert.equal("max_tokens" in body, false);
    }
});

test("derives a fresh request seed for every model and question", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL, CLONE],
        apiKey: "k",
        questionsPerFamily: 2,
        seed: 999,
        fetchImpl: createFakeServer({ behaviors: {}, bodies }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    const seeds = bodies.map((body) => Number(body.seed));
    assert.equal(seeds.length, 12);
    assert.equal(new Set(seeds).size, seeds.length);
    for (const seed of seeds) {
        assert.ok(Number.isInteger(seed) && seed > 0, `${seed}`);
        assert.notEqual(seed, result.seed);
    }
});

test("measures the account balance around the run", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL],
        apiKey: "k",
        questionsPerFamily: 1,
        seed: 21,
        fetchImpl: createFakeServer({
            behaviors: {},
            bodies,
            balances: [86.81695288, 86.8169],
        }),
        sleep: noopSleep,
        now: fakeClock(),
        log: noopLog,
        random: () => 0.5,
    });

    assert.equal(result.balanceBefore, 86.81695288);
    assert.equal(result.balanceAfter, 86.8169);
});

test("reports the run metadata the report and the workflow rely on", async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = await runEval({
        evalDefinition: aiwEval,
        models: [OFFICIAL],
        apiKey: "k",
        questionsPerFamily: 2,
        seed: 4,
        concurrency: 2,
        pollenBudget: 20,
        fetchImpl: createFakeServer({ behaviors: {}, bodies }),
        sleep: noopSleep,
        now: fakeClock(),
        measureBalance: false,
        log: noopLog,
        random: () => 0.5,
    });

    assert.equal(result.evalDefinition.id, "aiw");
    assert.equal(result.seed, 4);
    assert.equal(result.questionsPerFamily, 2);
    assert.equal(result.questions.length, 6);
    assert.equal(result.budgetPollen, 20);
    assert.match(result.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(result.durationSec >= 0);
});
