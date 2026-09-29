import assert from "node:assert/strict";
import { test } from "node:test";

import {
    type EvalQuestion,
    gradeAnswer,
    parseAnswerNumber,
} from "./src/eval.mts";

function question(expectedAnswer: number): EvalQuestion {
    return {
        id: "q",
        family: "aiw",
        variant: "test",
        prompt: "How many?",
        expectedAnswer,
        answerFormat: "number",
        meta: {},
    };
}

test("parseAnswerNumber reads the marker format the prompts ask for", () => {
    assert.deepEqual(parseAnswerNumber("### Answer: 4"), {
        value: 4,
        formatted: true,
    });
    assert.deepEqual(parseAnswerNumber("### Answer: 4.5"), {
        value: 4.5,
        formatted: true,
    });
    assert.deepEqual(parseAnswerNumber("### Answer: -2"), {
        value: -2,
        formatted: true,
    });
});

test("parseAnswerNumber keeps the last answer when a model restates the instruction", () => {
    const response = "I should reply with '### Answer: 0'.\n\n### Answer: 7";
    assert.deepEqual(parseAnswerNumber(response), {
        value: 7,
        formatted: true,
    });
});

test("parseAnswerNumber tolerates surrounding text", () => {
    assert.deepEqual(parseAnswerNumber("Reasoning...\n### Answer: 5 bowls"), {
        value: 5,
        formatted: true,
    });
});

test("parseAnswerNumber falls back to the last number for an unformatted response", () => {
    assert.deepEqual(parseAnswerNumber("There are 2 sisters in total."), {
        value: 2,
        formatted: false,
    });
    assert.deepEqual(parseAnswerNumber("Alice has 3 sisters, so 4"), {
        value: 4,
        formatted: false,
    });
});

test("parseAnswerNumber handles empty and numberless responses", () => {
    assert.deepEqual(parseAnswerNumber(""), { value: null, formatted: false });
    assert.deepEqual(parseAnswerNumber("### Answer: no idea"), {
        value: null,
        formatted: true,
    });
});

test("gradeAnswer accepts an exact answer and rejects a near miss", () => {
    assert.equal(gradeAnswer(question(4), "### Answer: 4").ok, true);
    assert.equal(gradeAnswer(question(4), "### Answer: 4.0").ok, true);
    assert.equal(gradeAnswer(question(4), "### Answer: 5").ok, false);
    assert.equal(gradeAnswer(question(4), "### Answer: 3").ok, false);
});

test("gradeAnswer tolerates float noise on decimal answers", () => {
    assert.equal(gradeAnswer(question(2.16), "### Answer: 2.16").ok, true);
    assert.equal(gradeAnswer(question(2.34375), "### Answer: 2.344").ok, false);
});

test("gradeAnswer counts a verbose answer by its last number", () => {
    const grade = gradeAnswer(question(5), "First I count 3, then 2, total 5");
    assert.equal(grade.ok, true);
    assert.equal(grade.formatted, false);
});

test("gradeAnswer fails an empty response", () => {
    assert.deepEqual(gradeAnswer(question(5), ""), {
        ok: false,
        answer: null,
        formatted: false,
    });
});
