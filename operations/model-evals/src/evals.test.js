import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { matchOfficialModel } from "./model-match.js";
import { generateQuestion, gradeQuestion } from "./questions.js";
import {
    evaluateModel,
    requestCompletion,
    seededRng,
    selectModels,
    writeRun,
} from "./runner.js";
import { wilsonMargin } from "./stats.js";

test("question families generate integer-answer tasks", () => {
    for (const family of ["aiw", "aiw_plus", "bowls"]) {
        const q = generateQuestion(family, seededRng(42));
        assert.equal(q.family, family);
        assert.ok(Number.isInteger(q.answer));
        assert.equal(
            gradeQuestion(family, `Final answer: ${q.answer}`, q.answer),
            true,
        );
        assert.equal(
            gradeQuestion(family, "Final answer: 9999", q.answer),
            false,
        );
    }
});

test("Wilson margin shrinks with more identical evidence", () => {
    assert.equal(wilsonMargin(0, 0), 1);
    assert.ok(wilsonMargin(20, 20) < wilsonMargin(2, 2));
});

test("model selection supports community and explicit aliases", () => {
    const models = [
        { name: "openai/a", aliases: ["a"], category: "text" },
        { name: "community/u/a", community: true, category: "text" },
        { name: "image/x", category: "image" },
    ];
    assert.deepEqual(
        selectModels(models, { communityOnly: true }).map((m) => m.name),
        ["community/u/a"],
    );
    assert.deepEqual(
        selectModels(models, { modelFilter: ["a"] }).map((m) => m.name),
        ["openai/a"],
    );
});

test("community model matches an official model by normalized leaf", () => {
    assert.equal(
        matchOfficialModel("community/someone/gpt-6-luna", [
            "openai/gpt-6-luna",
            "anthropic/claude-haiku-4.5",
        ]),
        "openai/gpt-6-luna",
    );
});

test("429 is retried and every request carries a seed", async () => {
    const bodies = [];
    let calls = 0;
    const fetchFn = async (_url, init) => {
        bodies.push(JSON.parse(init.body));
        calls += 1;
        if (calls === 1) {
            return {
                status: 429,
                ok: false,
                headers: { get: () => "0.001" },
                text: async () => "rate limit",
            };
        }
        return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            json: async () => ({
                choices: [{ message: { content: "Final answer: 3" } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
        };
    };
    const result = await requestCompletion({
        fetchFn,
        sleep: async () => {},
        apiKey: "test",
        model: "openai/test",
        prompt: "hello",
        seed: 12345,
        maxTokens: 32,
        timeoutMs: 5000,
        maxAttempts: 3,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(
        bodies.map((body) => body.seed),
        [12345, 12345],
    );
});

test("HTTP 200 balance messages are failures, not scored answers", async () => {
    const result = await requestCompletion({
        fetchFn: async () => ({
            status: 200,
            ok: true,
            headers: { get: () => null },
            json: async () => ({
                choices: [
                    {
                        message: {
                            content:
                                "The account behind this API key doesn't have enough credits. Please top up Pollen.",
                        },
                    },
                ],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
        }),
        apiKey: "test",
        model: "openai/test",
        prompt: "hello",
        seed: 1,
        maxTokens: 32,
        timeoutMs: 5000,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /account\/balance/);
});

test("result index preserves prior runs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "model-evals-"));
    const make = (runId) => ({
        runId,
        createdAt: `${runId}Z`,
        totalCost: 0.1,
        models: [],
    });
    await writeRun(dir, make("2026-01-01T00-00-00"));
    await writeRun(dir, make("2026-01-08T00-00-00"));
    const index = JSON.parse(
        await readFile(path.join(dir, "index.json"), "utf8"),
    );
    assert.deepEqual(
        index.runs.map((entry) => entry.runId),
        ["2026-01-08T00-00-00", "2026-01-01T00-00-00"],
    );
});

test("all models receive identical questions while request seeds remain model-specific", async () => {
    const promptsByModel = new Map();
    const seedsByModel = new Map();

    const makeFetch = (modelName) => async (_url, init) => {
        const body = JSON.parse(init.body);
        promptsByModel.set(modelName, [
            ...(promptsByModel.get(modelName) ?? []),
            body.messages[0].content,
        ]);
        seedsByModel.set(modelName, [
            ...(seedsByModel.get(modelName) ?? []),
            body.seed,
        ]);
        return {
            status: 200,
            ok: true,
            headers: { get: () => null },
            json: async () => ({
                choices: [{ message: { content: "Final answer: 0" } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
        };
    };

    const options = {
        apiKey: "test",
        families: ["aiw", "aiw_plus", "bowls"],
        trials: 2,
        runSeed: 424242,
        maxTokens: 32,
        timeoutMs: 5000,
        maxAttempts: 1,
        sleep: async () => {},
    };

    await evaluateModel(
        { name: "openai/model-a", pricing: {} },
        { ...options, fetchFn: makeFetch("openai/model-a") },
    );
    await evaluateModel(
        { name: "openai/model-b", pricing: {} },
        { ...options, fetchFn: makeFetch("openai/model-b") },
    );

    assert.deepEqual(
        promptsByModel.get("openai/model-a"),
        promptsByModel.get("openai/model-b"),
    );
    assert.notDeepEqual(
        seedsByModel.get("openai/model-a"),
        seedsByModel.get("openai/model-b"),
    );
});
