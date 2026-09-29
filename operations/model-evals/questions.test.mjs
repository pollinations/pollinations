import assert from "node:assert/strict";
import { test } from "node:test";

import {
    FAMILY_NAMES,
    familyTitle,
    generateQuestion,
    generateQuestionSet,
    isValidFamily,
} from "./questions.mjs";
import { createRng } from "./rng.mjs";

// Independent solvers used to verify the generator's ground truth: they
// re-derive the answer from the prompt text alone, so a generator bug and
// a solver bug cannot cancel out unless both implement the same error.

const NUMBER_WORDS = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
};

function num(token) {
    const lower = token.toLowerCase();
    if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
    return Number.parseInt(token, 10);
}

function solveAiw(prompt) {
    const match = prompt.match(
        /^(\w+) has (?:a )?(\w+) (sister|sisters|brother|brothers) and (?:she|he) also has (?:a )?(\w+) (sister|sisters|brother|brothers)/,
    );
    const sistersIsFirst = match[3].startsWith("sister");
    const sisters = sistersIsFirst ? num(match[2]) : num(match[4]);
    const brothers = sistersIsFirst ? num(match[4]) : num(match[2]);
    const female = /she also/.test(prompt);
    const asksSisters = /How many sisters/.test(prompt);
    if (asksSisters) {
        return female ? sisters + 1 : sisters;
    }
    return female ? brothers : brothers + 1;
}

function solveAiwPlus(prompt) {
    const sisters = Number.parseInt(prompt.match(/has (\d+) sisters?/)[1], 10);
    const brothersMatch = prompt.match(/and (\d+) brothers? in total/);
    const brothers = brothersMatch ? Number.parseInt(brothersMatch[1], 10) : 0;
    const auntNephews = Number.parseInt(
        prompt.match(/she has (\d+) nephews?/)[1],
        10,
    );
    const auntNieces = Number.parseInt(
        prompt.match(/and (\d+) nieces? in total/)[1],
        10,
    );
    const uncleNephews = Number.parseInt(
        prompt.match(/brother who has (\d+) nephews?/)[1],
        10,
    );
    const uncleNieces = Number.parseInt(
        prompt.match(/and (\d+) nieces? in total, and who also has/)[1],
        10,
    );
    const uncleChildren = Number.parseInt(
        prompt.match(/also has (\d+) (?:sons?|daughters?)/)[1],
        10,
    );
    const familyGirls = 1 + sisters;
    const familyBoys = brothers;
    return (
        auntNephews -
        familyBoys +
        (auntNieces - familyGirls) +
        (uncleNephews - familyBoys) +
        (uncleNieces - familyGirls) +
        uncleChildren
    );
}

function solveBowls(prompt) {
    const bigColor = prompt.match(/big (\w+) bowl/)[1];
    const distractor = prompt.match(
        /there are (\d+) (\w+) bowls? and (\d+) (\w+) bowls? on the table/,
    );
    const askedMatch = prompt.match(/How many (\w+) bowls? are on the table/);
    const askedColor = askedMatch[1];
    const askedCount = Number.parseInt(
        askedColor === distractor[2]
            ? distractor[1]
            : askedColor === distractor[4]
              ? distractor[3]
              : "0",
        10,
    );
    return askedCount + (bigColor === askedColor ? 1 : 0);
}

test("all three families generate with valid, code-computed answers", () => {
    for (const family of FAMILY_NAMES) {
        for (let i = 0; i < 300; i++) {
            const rng = createRng(i * 7919 + family.length);
            const question = generateQuestion(family, rng);
            assert.ok(question.prompt.length > 40, "prompt is non-trivial");
            assert.equal(question.family, family);
            assert.equal(
                question.prompt.includes("### Answer"),
                true,
                "prompt requests the answer format",
            );
            const solver =
                family === "aiw"
                    ? solveAiw
                    : family === "aiw-plus"
                      ? solveAiwPlus
                      : solveBowls;
            assert.equal(
                solver(question.prompt),
                question.answer,
                `solver disagrees for prompt: ${question.prompt}`,
            );
        }
    }
});

test("fresh numbers on every run: different seeds give different prompts", () => {
    const a = generateQuestionSet({
        families: FAMILY_NAMES,
        questionsPerFamily: 5,
        rng: createRng(1),
    });
    const b = generateQuestionSet({
        families: FAMILY_NAMES,
        questionsPerFamily: 5,
        rng: createRng(2),
    });
    const promptsA = a.map((question) => question.prompt).join("\n");
    const promptsB = b.map((question) => question.prompt).join("\n");
    assert.notEqual(promptsA, promptsB);
});

test("question sets contain every family", () => {
    const questions = generateQuestionSet({
        families: FAMILY_NAMES,
        questionsPerFamily: 3,
        rng: createRng(42),
    });
    assert.equal(questions.length, 9);
    for (const family of FAMILY_NAMES) {
        assert.equal(
            questions.filter((question) => question.family === family).length,
            3,
        );
    }
});

test("family validation and titles", () => {
    assert.equal(isValidFamily("aiw"), true);
    assert.equal(isValidFamily("nope"), false);
    assert.equal(familyTitle("aiw-plus"), "AIW+");
    assert.throws(
        () => generateQuestion("nope", createRng(1)),
        /Unknown eval family/,
    );
});

// A scripted rng: returns the given values in order, then repeats the
// last one. Lets the test pin down exactly which branch of the generator
// runs.
function scriptedRng(values) {
    let index = 0;
    return () => {
        const value = values[Math.min(index, values.length - 1)];
        index += 1;
        return value;
    };
}

test("AIW family reproduces the classic LAION ground truth", () => {
    // LAION prompts.json: "Alice has 4 sisters and she also has 1 brother.
    // How many sisters does Alice's brother have?" -> 5
    const question = generateQuestion(
        "aiw",
        scriptedRng([0, 0, 3.5 / 7, 0, 0.9, 0.1, 0.9, 0.9]),
    );
    assert.equal(
        question.prompt.startsWith(
            "Alice has 4 sisters and she also has 1 brother. How many sisters does Alice's brother have?",
        ),
        true,
    );
    assert.equal(question.answer, 5);

    // Male subject, opposite question: the brother count includes Bob
    // himself for his sister. "Bob has 2 sisters and he also has 3
    // brothers. How many brothers does Bob's sister have?" -> 4
    const bob = generateQuestion(
        "aiw",
        scriptedRng([1, 0, 1 / 7, 2 / 7, 0.9, 0.9, 0.9, 0.9]),
    );
    assert.equal(
        bob.prompt.startsWith(
            "Bob has 2 sisters and he also has 3 brothers. How many brothers does Bob's sister have?",
        ),
        true,
    );
    assert.equal(bob.answer, 4);
});
