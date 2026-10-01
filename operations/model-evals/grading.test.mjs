import assert from "node:assert/strict";
import { test } from "node:test";

import { isCorrect, parseAnswer } from "./grading.mjs";

test("parses the ### Answer marker the prompts ask for", () => {
    assert.equal(parseAnswer("Blah blah.\n### Answer: 5"), 5);
    assert.equal(parseAnswer("### Answer: 42."), 42);
    assert.equal(parseAnswer('### Answer: "3"'), 3);
});

test("parses lowercase answer: markers", () => {
    assert.equal(parseAnswer("The answer is obvious. answer: 7"), 7);
    assert.equal(parseAnswer("Final Answer: 12"), 12);
});

test("falls back to the last number when the format is ignored", () => {
    assert.equal(parseAnswer("I think it is 4 sisters, so 5 in total."), 5);
    assert.equal(parseAnswer("Counting again: 2 plus 1 gives 3."), 3);
});

test("negative numbers parse", () => {
    assert.equal(parseAnswer("### Answer: -3"), -3);
});

test("returns null when no number is present", () => {
    assert.equal(parseAnswer(""), null);
    assert.equal(parseAnswer(null), null);
    assert.equal(parseAnswer("no numbers here"), null);
});

test("isCorrect compares the parsed value against the expected answer", () => {
    assert.equal(isCorrect(5, 5), true);
    assert.equal(isCorrect(5, 6), false);
    assert.equal(isCorrect(null, 5), false);
    assert.equal(isCorrect(4.0, 4), true);
});

test("uses final markers and does not truncate fractions or scientific notation", () => {
    assert.equal(parseAnswer("answer: 3. Correction. ### Answer: 5"), 5);
    assert.equal(parseAnswer("### Answer: 5e2"), 500);
    assert.equal(parseAnswer("### Answer: 5/2"), null);
    assert.equal(parseAnswer("There are 5 sisters. ### Answer: unknown"), null);
    assert.equal(parseAnswer("### Answer: 4,000"), 4000);
});
