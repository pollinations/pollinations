import assert from "node:assert/strict";
import { test } from "node:test";
import { imageBoard } from "./image-board.js";
import { textBoard } from "./text-board.js";

const DATE = "2026-10-31";
// The public models; p/secret, the busiest, is private.
const LISTED = new Set([
    "a/chatty",
    "b/worker",
    "c/quiet",
    "a/flux",
    "b/sdxl",
    "c/broken",
]);
const text = (model, requests, total_tokens, median_tps, success = 100) => ({
    model,
    requests,
    total_tokens,
    median_tps,
    success,
});

test("the text board ranks busy public models by tokens, with totals over all public ones", () => {
    const board = textBoard(
        [
            text("a/chatty", 900, 1_000, 50),
            text("b/worker", 60, 9_000, 20, 93.07),
            text("c/quiet", 49, 50_000, 300),
            text("p/secret", 5_000, 1_000_000, 400),
        ],
        DATE,
        LISTED,
    );
    const lines = board.markdown.split("\n");
    assert.equal(lines[0], `# 🏆 COMMUNITY MODEL LEADERBOARD — ${DATE}`);
    assert.equal(
        lines[2],
        "**60,000 tokens** served in 24 hours across 3 models.",
    );
    assert.equal(lines[4], "👑 `b/worker` — 9,000 tokens · 93.07% success");
    // The quiet model counts in the totals, never on the board.
    assert.match(lines[5], /`a\/chatty` — \*\*50 tokens\/sec\*\*/);
    assert.equal(lines[6], "🐝 workhorse: `a/chatty` — 900 requests");
    assert.doesNotMatch(board.html, /c<\/b>\/quiet/);
    assert.doesNotMatch(board.html + board.markdown, /secret/);
    assert.match(board.html, /<style id="fonts">@font-face/);
    assert.equal(
        textBoard([text("c/quiet", 49, 50_000, 300)], DATE, LISTED),
        null,
    );
});

test("the image board ranks models with images, fastest first", () => {
    const image = (model, requests, images, median_seconds, success) => ({
        model,
        requests,
        images,
        median_seconds,
        success,
    });
    const board = imageBoard(
        [
            image("a/flux", 500, 480, 9.4, 100),
            image("b/sdxl", 20, 18, 5.8, 100),
            image("c/broken", 30, 0, 0, 0),
            image("p/secret", 900, 900, 1, 100),
        ],
        DATE,
        LISTED,
    );
    const lines = board.markdown.split("\n");
    assert.equal(
        lines[2],
        "**498 images** generated in 24 hours across 3 models (550 requests).",
    );
    assert.equal(lines[4], "👑 `a/flux` — 480 images · 100% success");
    assert.equal(lines[5], "⚡ fastest: `b/sdxl` — **5.8 sec/image** median");
    assert.equal(lines.at(-1), "🛡️ flawless: 2 models at 100% success");
    assert.doesNotMatch(board.html, /c<\/b>\/broken/);
    assert.doesNotMatch(board.html + board.markdown, /secret/);
    assert.equal(
        imageBoard([image("c/broken", 30, 0, 0, 0)], DATE, LISTED),
        null,
    );
});
