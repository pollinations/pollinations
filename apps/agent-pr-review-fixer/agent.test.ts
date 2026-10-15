// Unit tests for the pr-review-fixer agent.
//
// Run with:  node --test agent.test.ts
// (Node 22.6+; Node 23+ strips types by default. No dependencies.)

import assert from "node:assert/strict";
import test from "node:test";

import {
    BOUNDARIES,
    buildReviewPrompt,
    capDiff,
    fixCommands,
    inputTextOf,
    parseHeadRef,
    parsePrRef,
} from "./agent.ts";

/* ------------------------------- parsePrRef ------------------------------ */

test("parsePrRef reads a full GitHub PR URL", () => {
    assert.deepEqual(
        parsePrRef(
            "Review https://github.com/pollinations/pollinations/pull/17245 please",
        ),
        { owner: "pollinations", repo: "pollinations", number: 17245 },
    );
});

test("parsePrRef reads an ssh-style URL", () => {
    assert.deepEqual(parsePrRef("git@github.com:hyyfree/demo/pull/7"), {
        owner: "hyyfree",
        repo: "demo",
        number: 7,
    });
});

test("parsePrRef reads the owner/repo#N shorthand", () => {
    assert.deepEqual(parsePrRef("look at hyyfree/demo#12 and fix it"), {
        owner: "hyyfree",
        repo: "demo",
        number: 12,
    });
});

test("parsePrRef ignores text without a PR", () => {
    assert.equal(parsePrRef("hello world"), null);
    assert.equal(parsePrRef("pollinations/pollinations#"), null);
});

/* ------------------------------- inputTextOf ----------------------------- */

test("inputTextOf reads a Responses input string", () => {
    assert.equal(inputTextOf({ input: "hi" }), "hi");
});

test("inputTextOf reads Responses input parts", () => {
    assert.equal(
        inputTextOf({ input: [{ type: "input_text", text: "yo" }] }),
        "yo",
    );
});

test("inputTextOf reads the last user message from chat bodies", () => {
    const body = {
        messages: [
            { role: "system", content: "sys" },
            { role: "user", content: "first" },
            { role: "assistant", content: "ok" },
            { role: "user", content: "second" },
        ],
    };
    assert.equal(inputTextOf(body), "second");
});

test("inputTextOf handles non-objects", () => {
    assert.equal(inputTextOf(null), "");
    assert.equal(inputTextOf("plain"), "");
});

/* --------------------------------- capDiff -------------------------------- */

test("capDiff keeps small diffs untouched", () => {
    assert.deepEqual(capDiff("diff --git a/x b/x"), {
        text: "diff --git a/x b/x",
        truncated: false,
    });
});

test("capDiff truncates huge diffs and says so", () => {
    const result = capDiff("x".repeat(200_000));
    assert.equal(result.truncated, true);
    assert.equal(result.text.length, 120_000);
});

/* ------------------------------- parseHeadRef ----------------------------- */

test("parseHeadRef reads headRefName from PR page HTML", () => {
    assert.equal(
        parseHeadRef(
            '<script>{"headRefName":"fix/bug","baseRefName":"main"}</script>',
        ),
        "fix/bug",
    );
});

test("parseHeadRef returns null when absent", () => {
    assert.equal(parseHeadRef("<html>no embedded json</html>"), null);
});

/* ------------------------------- fixCommands ------------------------------ */

test("fixCommands check out the PR head, apply, commit and push without force", () => {
    const commands = fixCommands(
        { owner: "hyyfree", repo: "demo", number: 5 },
        "feature-branch",
        "fix: null check\nsecond line",
    );
    assert.equal(commands.length, 5);
    assert.match(
        commands[0],
        /git clone https:\/\/github\.com\/hyyfree\/demo\.git/,
    );
    assert.equal(
        commands[1],
        "git fetch origin pull/5/head:pr-5 && git checkout pr-5",
    );
    assert.equal(commands[2], "git apply fix.patch");
    assert.ok(!commands[3].includes("\n"));
    assert.equal(commands[4], "git push origin HEAD:feature-branch");
    assert.ok(!commands.some((c) => c.includes("--force")));
});

test("fixCommands escape quotes in the commit subject", () => {
    const commands = fixCommands(
        { owner: "o", repo: "r", number: 1 },
        "main",
        'say "hi"',
    );
    assert.ok(commands[3].includes('\\"hi\\"'));
});

/* ------------------------------ buildReviewPrompt -------------------------- */

test("buildReviewPrompt embeds diff, head ref and exact commands verbatim", () => {
    const ref = { owner: "hyyfree", repo: "demo", number: 3 };
    const commands = fixCommands(ref, "fix/x", 'fix: y "quoted"');
    const prompt = buildReviewPrompt(
        ref,
        { text: "--- a/x", truncated: false },
        "fix/x",
        commands,
    );
    assert.ok(prompt.includes("pull/3"));
    assert.ok(prompt.includes("PR head branch: fix/x"));
    // The commands appear as a verbatim JSON array the model can echo.
    const block = prompt.slice(prompt.indexOf("OPERATOR-COMMANDS"));
    const jsonStart = block.indexOf("[");
    const jsonEnd = block.indexOf("]");
    const parsed = JSON.parse(block.slice(jsonStart, jsonEnd + 1));
    assert.deepEqual(parsed, commands);
    assert.ok(prompt.includes("--- a/x"));
    assert.ok(prompt.includes(BOUNDARIES[0]));
    // No command ever force-pushes.
    assert.ok(!prompt.includes("--force"));
});

test("buildReviewPrompt notes truncation", () => {
    const ref = { owner: "o", repo: "r", number: 1 };
    const prompt = buildReviewPrompt(
        ref,
        { text: "d", truncated: true },
        "b",
        fixCommands(ref, "b", "m"),
    );
    assert.ok(prompt.includes("truncated"));
});

/* --------------------------- automation boundaries ------------------------ */

test("boundaries forbid merging, force-push and secrets", () => {
    const text = BOUNDARIES.join(" ").toLowerCase();
    assert.ok(text.includes("never merges"));
    assert.ok(text.includes("never force-pushes"));
    assert.ok(text.includes("no github credentials"));
    assert.ok(text.includes("never writes outside"));
});
