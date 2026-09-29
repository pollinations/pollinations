import assert from "node:assert/strict";
import { test } from "node:test";
import { generateQuestionSet } from "./questions.mjs";
import { createRng, requestSeed } from "./rng.mjs";
import { runEval } from "./runner.mjs";

const MODEL = {
    name: "openai/test-model",
    community: false,
    pricing: {
        promptTextTokens: "0.0000001",
        promptCachedTokens: "0",
        completionTextTokens: "0.000001",
    },
};

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    };
}

function makeQuestions(count = 2, family = "aiw") {
    return generateQuestionSet({
        families: [family],
        questionsPerFamily: count,
        rng: createRng(7),
    });
}

function baseOverrides(overrides = {}) {
    return {
        retryDelaysMs: [10, 20],
        timeoutMs: 1000,
        concurrency: 1,
        ...overrides,
    };
}

test("scores correct and wrong answers from the response content", async () => {
    const questions = makeQuestions(2);
    const bodies = [
        jsonResponse(200, {
            choices: [
                { message: { content: `### Answer: ${questions[0].answer}` } },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        jsonResponse(200, {
            choices: [{ message: { content: "### Answer: 999" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    ];
    const requests = [];
    const { totalCostPollen, entries } = await runEval({
        models: [MODEL],
        questions,
        costPollenOf: (_model, usage) =>
            (usage?.prompt_tokens ?? 0) * 1e-7 +
            (usage?.completion_tokens ?? 0) * 1e-6,
        runSeed: 1,
        options: baseOverrides(),
        fetchFn: async (_url, init) => {
            requests.push(JSON.parse(init.body));
            return bodies[requests.length - 1];
        },
    });
    assert.equal(entries[0].status, "scored");
    const results = entries[0].questionResults;
    assert.equal(results[0].correct, true);
    assert.equal(results[1].correct, false);
    // 2 requests * (10 * 1e-7 + 5 * 1e-6)
    assert.ok(Math.abs(totalCostPollen - 0.000012) < 1e-9);
    // Every request carries a seed so cached answers never repeat.
    assert.ok(requests.every((body) => Number.isInteger(body.seed)));
    const seeds = new Set(requests.map((body) => body.seed));
    assert.equal(seeds.size, 2);
});

test("a 429 is retried slowly instead of counting as failed", async () => {
    const questions = makeQuestions(1);
    let calls = 0;
    const { entries } = await runEval({
        models: [MODEL],
        questions,
        runSeed: 2,
        options: baseOverrides({ retryDelaysMs: [1] }),
        fetchFn: async () => {
            calls += 1;
            if (calls === 1) {
                return jsonResponse(429, {
                    error: { message: "rate limit" },
                });
            }
            return jsonResponse(200, {
                choices: [{ message: { content: "### Answer: wrong" } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            });
        },
    });
    assert.equal(calls, 2);
    assert.equal(entries[0].questionResults[0].error, null);
});

test("an exhausted 429 retry budget counts the question as failed", async () => {
    const questions = makeQuestions(1);
    const { entries } = await runEval({
        models: [MODEL],
        questions,
        runSeed: 3,
        options: baseOverrides({ retryDelaysMs: [1, 1] }),
        fetchFn: async () => jsonResponse(429, { error: { message: "no" } }),
    });
    const result = entries[0].questionResults[0];
    assert.equal(result.correct, false);
    assert.equal(result.error, "rate_limited");
});

test("a timeout counts as failed, not skipped", async () => {
    const questions = makeQuestions(1);
    const { entries } = await runEval({
        models: [MODEL],
        questions,
        runSeed: 4,
        options: baseOverrides({ timeoutMs: 30 }),
        fetchFn: (_url, init) =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(
                    () => resolve(jsonResponse(200, {})),
                    500,
                );
                init.signal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    const error = new Error("The operation was aborted");
                    error.name = "AbortError";
                    reject(error);
                });
            }),
    });
    const result = entries[0].questionResults[0];
    assert.equal(result.correct, false);
    assert.equal(result.error, "timeout");
});

test("an HTTP error counts as failed with the error recorded", async () => {
    const questions = makeQuestions(1);
    const { entries } = await runEval({
        models: [MODEL],
        questions,
        runSeed: 5,
        options: baseOverrides(),
        fetchFn: async () =>
            jsonResponse(500, { error: { message: "upstream down" } }),
    });
    const result = entries[0].questionResults[0];
    assert.equal(result.correct, false);
    assert.equal(result.error, "upstream down");
});

test("the Pollen cost cap stops the run and marks models unscored", async () => {
    const questions = makeQuestions(2);
    const models = [MODEL, { name: "community/x/model-b", community: true }];
    const { entries, capReached } = await runEval({
        models,
        questions,
        costPollenOf: () => 100,
        runSeed: 6,
        options: baseOverrides({ maxCostPollen: 150 }),
        fetchFn: async () =>
            jsonResponse(200, {
                choices: [{ message: { content: "### Answer: 1" } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
    });
    assert.equal(capReached, true);
    // Model A finished just as the cap was crossed; model B never started.
    assert.equal(entries[0].status, "scored");
    assert.equal(entries[0].questionResults.length, 2);
    assert.equal(entries[1].status, "over_cost_cap");
    assert.equal(entries[1].questionResults.length, 0);
});

test("missing usage is tolerated and costs nothing", async () => {
    const questions = makeQuestions(1);
    const { totalCostPollen, entries } = await runEval({
        models: [{ ...MODEL, pricing: undefined }],
        questions,
        runSeed: 8,
        options: baseOverrides(),
        fetchFn: async () =>
            jsonResponse(200, {
                choices: [{ message: { content: "### Answer: 1" } }],
            }),
    });
    assert.equal(totalCostPollen, 0);
    assert.equal(entries[0].status, "scored");
});

test("request seeds are stable for the same inputs and vary across them", () => {
    const a = requestSeed(99, "model-a", "q1", 1);
    const b = requestSeed(99, "model-a", "q2", 1);
    const c = requestSeed(99, "model-b", "q1", 1);
    const aAgain = requestSeed(99, "model-a", "q1", 1);
    assert.equal(a, aAgain);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
});
