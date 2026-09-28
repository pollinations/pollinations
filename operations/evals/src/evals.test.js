import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAnswer, grade, aiw, aiwPlus, bowls } from "./puzzle.js";
import { makeRng, repeatSeed, runSeed } from "./rng.js";
import { sampleModel } from "./client.js";
import { impostorGaps, scoreModel, wilson } from "./score.js";

test("extractAnswer reads the text after ### Answer:", () => {
    assert.equal(extractAnswer("blah ### Answer: 3"), "3");
    assert.equal(extractAnswer("### Answer: -2"), "-2");
    assert.equal(extractAnswer("the answer is 5"), "5");
    assert.equal(extractAnswer("no number here"), null);
    assert.equal(extractAnswer(42), null);
});

test("grade compares the final number", () => {
    assert.equal(grade("### Answer: 4", 4), true);
    assert.equal(grade("### Answer: 4", 5), false);
});

test("aiw computes sisters + 1 and is well formed", () => {
    const q = aiw(makeRng(1), "Alice");
    assert.match(q.prompt, /Alice has \d+ brothers/);
    assert.match(q.prompt, /### Answer:/);
    // Alice has S sisters; a brother has S+1 sisters (Alice + her sisters).
    const sisters = Number(q.prompt.match(/she also has (\d+) sister/)[1]);
    assert.equal(q.expected, sisters + 1);
});

test("aiwPlus answer is a non-negative integer", () => {
    for (let s = 1; s < 20; s++) {
        const q = aiwPlus(makeRng(s), "Alice");
        assert.ok(Number.isInteger(q.expected) && q.expected >= 0);
    }
});

test("bowls totals blue + red", () => {
    const q = bowls(makeRng(7), "Alice");
    const blue = Number(q.prompt.match(/(\d+) blue bowl/)[1]);
    const red = Number(q.prompt.match(/(\d+) red bowl/)[1]);
    assert.equal(q.expected, blue + red);
});

test("RNG is deterministic for a seed and varies across seeds", () => {
    assert.equal(makeRng(5).int(0, 100), makeRng(5).int(0, 100));
    assert.notEqual(makeRng(5).int(0, 100), makeRng(6).int(0, 100));
});

test("runSeed uses an explicit seed and repeatSeed varies", () => {
    assert.equal(runSeed(123), 123);
    assert.notEqual(repeatSeed(123, 0), repeatSeed(123, 1));
});

test("seeds stay in the API-accepted signed 32-bit range", () => {
    assert.ok(runSeed(3000000000) < 2 ** 31);
    for (let i = 0; i < 500; i++) {
        const s = runSeed();
        assert.ok(s >= 0 && s < 2 ** 31, `seed ${s} out of range`);
    }
    for (let i = 0; i < 500; i++) {
        const s = repeatSeed(2000000000, i);
        assert.ok(s >= 0 && s < 2 ** 31, `repeat seed ${s} out of range`);
    }
});

test("wilson gives a margin and handles zero samples", () => {
    assert.deepEqual(wilson(0, 0), { p: 0, low: 0, high: 0, margin: 0 });
    const all = wilson(4, 4);
    const half = wilson(2, 4);
    assert.ok(all.low > 0.4 && all.high === 1);
    assert.ok(half.margin > all.margin);
});

test("scoreModel counts failures as incorrect, not skipped", () => {
    const score = scoreModel("m", [
        { ok: true, correct: true, usage: { prompt_tokens: 10, completion_tokens: 2 } },
        { ok: false, correct: false },
        { ok: true, correct: false, usage: { prompt_tokens: 10, completion_tokens: 1 } },
        { ok: true, correct: true, usage: { prompt_tokens: 10, completion_tokens: 3 } },
    ]);
    assert.equal(score.total, 4);
    assert.equal(score.failed, 1);
    assert.equal(score.correct, 2);
    assert.equal(score.accuracy, 0.5);
    assert.equal(score.promptTokens, 30);
});

test("impostorGaps only pairs same base names and flags big gaps", () => {
    const scores = [
        { model: "openai/gpt-6", accuracy: 0.9, margin: 0.05, community: false },
        { model: "community/mallory/gpt-6", accuracy: 0.2, margin: 0.05, community: true },
        { model: "community/mallory/pen", accuracy: 0.5, margin: 0.05, community: true },
    ];
    const gaps = impostorGaps(scores);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].community, "community/mallory/gpt-6");
    assert.equal(gaps[0].highlighted, true);
});

test("sampleModel marks a 429 as rate_limit and retries slowly", async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        if (calls === 1) return { status: 429, ok: false, headers: { get: () => null }, text: async () => "slow down" };
        return {
            status: 200,
            ok: true,
            json: async () => ({ choices: [{ message: { content: "### Answer: 4" } }], model: "m", usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        };
    };
    const res = await sampleModel({ model: "m", prompt: "q", seed: 1, fetchImpl, sleep: async () => {} });
    assert.equal(res.ok, true);
    assert.equal(res.attempts, 2);
    assert.equal(res.content, "### Answer: 4");
});

test("sampleModel reports a timeout as a failed sample", async () => {
    const fetchImpl = async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
            });
        });
    const res = await sampleModel({ model: "m", prompt: "q", seed: 1, fetchImpl, timeoutMs: 5 });
    assert.equal(res.ok, false);
    assert.equal(res.kind, "timeout");
});

test("sampleModel returns no content as a parse failure it does not throw on", async () => {
    const fetchImpl = async () => ({ status: 200, ok: true, json: async () => ({ choices: [{ message: {} }] }) });
    const res = await sampleModel({ model: "m", prompt: "q", seed: 1, fetchImpl });
    assert.equal(res.ok, false);
    assert.equal(res.kind, "parse");
});
