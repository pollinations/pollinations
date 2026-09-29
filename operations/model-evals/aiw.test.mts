import assert from "node:assert/strict";
import { test } from "node:test";

import { AIW_FAMILIES, aiwEval, aiwPlusAnswer } from "./evals/aiw.mts";
import { DEFAULT_EVAL_ID, findEval, listEvalIds } from "./evals/index.mts";
import { ANSWER_MARKER } from "./src/eval.mts";

const SEED = 20260927;

test("the registry exposes the eval by id", () => {
    assert.deepEqual(listEvalIds(), ["aiw"]);
    assert.equal(findEval("aiw"), aiwEval);
    assert.equal(DEFAULT_EVAL_ID, "aiw");
    assert.throws(() => findEval("nope"), /Unknown eval/);
});

test("a seed reproduces the same quiz and a new seed changes it", () => {
    const first = aiwEval.questions({ seed: SEED, perFamily: 3 });
    const second = aiwEval.questions({ seed: SEED, perFamily: 3 });
    const other = aiwEval.questions({ seed: SEED + 1, perFamily: 3 });
    assert.deepEqual(first, second);
    assert.notDeepEqual(
        first.map((question) => question.prompt),
        other.map((question) => question.prompt),
    );
});

test("every family is generated, with unique ids", () => {
    const questions = aiwEval.questions({ seed: SEED, perFamily: 4 });
    assert.equal(questions.length, AIW_FAMILIES.length * 4);
    const ids = new Set(questions.map((question) => question.id));
    assert.equal(ids.size, questions.length);
    for (const family of AIW_FAMILIES) {
        assert.equal(
            questions.filter((question) => question.family === family).length,
            4,
        );
    }
});

test("every prompt asks for the marker format", () => {
    for (const question of aiwEval.questions({ seed: SEED, perFamily: 3 })) {
        assert.ok(
            question.prompt.includes(ANSWER_MARKER),
            `${question.id}: ${question.prompt}`,
        );
    }
});

test("sibling puzzles are graded as sisters + 1", () => {
    for (let seed = 1; seed <= 20; seed++) {
        for (const question of aiwEval.questions({ seed, perFamily: 3 })) {
            if (question.family !== "aiw") {
                continue;
            }
            const sisters = Number(question.meta.sisters);
            const brothers = Number(question.meta.brothers);
            assert.equal(question.expectedAnswer, sisters + 1);
            assert.ok(question.prompt.includes(`${brothers} brothers`));
            assert.ok(question.prompt.includes(`${sisters} sister`));
        }
    }
});

test("AIW+ matches the paper's worked example", () => {
    assert.equal(
        aiwPlusAnswer({
            sisters: 3,
            niecesMother: 7,
            niecesFather: 5,
            uncleSons: 1,
        }),
        5,
    );
});

test("cousin puzzles are consistent with their own meta data", () => {
    for (let seed = 1; seed <= 20; seed++) {
        for (const question of aiwEval.questions({ seed, perFamily: 3 })) {
            if (question.family !== "aiwplus") {
                continue;
            }
            const meta = {
                sisters: Number(question.meta.sisters),
                niecesMother: Number(question.meta.niecesMother),
                niecesFather: Number(question.meta.niecesFather),
                uncleSons: Number(question.meta.uncleSons),
            };
            assert.equal(question.expectedAnswer, aiwPlusAnswer(meta));
            // The puzzle must keep at least one child on both sides of the family.
            assert.ok(meta.niecesMother - (meta.sisters + 1) >= 1);
            assert.ok(meta.niecesFather - (meta.sisters + 1) >= 1);
            assert.ok(question.expectedAnswer >= 3);
            assert.ok(question.prompt.includes(`${meta.niecesMother}`));
            assert.ok(question.prompt.includes(`${meta.niecesFather}`));
        }
    }
});

test("bowl puzzles count the big bowl only in the grouped variant", () => {
    for (let seed = 1; seed <= 20; seed++) {
        for (const question of aiwEval.questions({ seed, perFamily: 4 })) {
            if (question.family !== "bowls") {
                continue;
            }
            const reds = Number(question.meta.reds);
            const blues = Number(question.meta.blues);
            const bigColor = String(question.meta.bigColor);
            if (question.variant === "control") {
                assert.equal(question.expectedAnswer, reds + blues);
                assert.ok(question.prompt.includes("beside the big bowl"));
                continue;
            }
            const askedColor = String(question.meta.askedColor);
            const matching = askedColor === "red" ? reds : blues;
            assert.equal(
                question.expectedAnswer,
                matching + (bigColor === askedColor ? 1 : 0),
            );
            assert.ok(question.prompt.includes(`How many ${askedColor} bowls`));
        }
    }
});

test("a family produces both bowl variants", () => {
    const variants = new Set(
        aiwEval
            .questions({ seed: SEED, perFamily: 4 })
            .filter((question) => question.family === "bowls")
            .map((question) => question.variant),
    );
    assert.deepEqual([...variants].sort(), ["control", "grouped"]);
});

test("grading accepts the gold answer and rejects an off-by-one", () => {
    for (const question of aiwEval.questions({ seed: SEED, perFamily: 3 })) {
        assert.equal(
            aiwEval.grade(question, `### Answer: ${question.expectedAnswer}`)
                .ok,
            true,
        );
        assert.equal(
            aiwEval.grade(
                question,
                `### Answer: ${question.expectedAnswer + 1}`,
            ).ok,
            false,
        );
        assert.equal(aiwEval.grade(question, "").ok, false);
    }
});
