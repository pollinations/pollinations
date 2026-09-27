import assert from "node:assert/strict";
import { test } from "node:test";
import { findOfficialMatch } from "./matchOfficial.js";
import {
    extractAnswer,
    generateAiw,
    generateAiwPlus,
    generateBowls,
    generateQuestion,
    gradeAnswer,
    marginOfError,
} from "./questions.js";

function fixedRng(values) {
    let i = 0;
    return () => values[i++ % values.length];
}

test("generateAiw: sisters + 1 is the correct answer", () => {
    const q = generateAiw(fixedRng([0.1, 0.6]));
    assert.equal(q.family, "aiw");
    assert.match(q.prompt, /Alice has \d+ brothers/);
    assert.ok(q.answer >= 2);
});

test("generateAiwPlus: distractor relatives don't change the answer", () => {
    const q = generateAiwPlus(fixedRng([0.2, 0.4, 0.6, 0.8]));
    const siblingsMatch = q.prompt.match(/brothers and (\d+) sisters/);
    assert.equal(q.answer, Number.parseInt(siblingsMatch[1], 10) + 1);
});

test("generateBowls: total fruit matches the arithmetic in the prompt", () => {
    for (let seed = 0; seed < 20; seed++) {
        const rng = fixedRng([
            (seed * 0.13) % 1,
            (seed * 0.29) % 1,
            (seed * 0.53) % 1,
            (seed * 0.71) % 1,
        ]);
        const q = generateBowls(rng);
        assert.ok(Number.isInteger(q.answer));
        assert.ok(q.answer > 0);
    }
});

test("generateQuestion dispatches to the right family and rejects unknown ones", () => {
    const rng = fixedRng([0.5]);
    assert.equal(generateQuestion("aiw", rng).family, "aiw");
    assert.equal(generateQuestion("bowls", rng).family, "bowls");
    assert.throws(() => generateQuestion("nope", rng));
});

test("extractAnswer reads the labeled final answer first", () => {
    assert.equal(extractAnswer("I think it's 3.\nFinal answer: 7"), 7);
    assert.equal(extractAnswer("no numbers here"), null);
    assert.equal(extractAnswer("the total is 42"), 42);
});

test("gradeAnswer is correct only when the extracted number matches", () => {
    const question = { answer: 5 };
    assert.equal(gradeAnswer(question, "Final answer: 5"), true);
    assert.equal(gradeAnswer(question, "Final answer: 6"), false);
    assert.equal(gradeAnswer(question, "I refuse to answer"), false);
});

test("marginOfError shrinks as trial count grows and is 0 for no trials", () => {
    assert.equal(marginOfError(0, 0), 0);
    const small = marginOfError(3, 5);
    const large = marginOfError(30, 50);
    assert.ok(small > large);
    assert.ok(small > 0 && small <= 1);
});

test("findOfficialMatch pairs a community model with its namesake", () => {
    const official = [
        { name: "openai/gpt-6-luna", aliases: ["gpt-6-luna"] },
        { name: "anthropic/claude-opus-5.5", aliases: [] },
    ];
    const match = findOfficialMatch(
        { name: "community/Saauf/gpt-6-luna", community: true },
        official,
    );
    assert.equal(match.name, "openai/gpt-6-luna");

    assert.equal(
        findOfficialMatch(
            { name: "community/someone/totally-original", community: true },
            official,
        ),
        null,
    );
    assert.equal(
        findOfficialMatch(
            { name: "openai/gpt-6-luna", community: false },
            official,
        ),
        null,
    );
});
