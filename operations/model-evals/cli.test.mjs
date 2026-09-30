import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parseArgs } from "./cli.mjs";

test("CLI rejects invalid numeric settings and empty subsets", () => {
    for (const args of [
        ["--questions", "NaN"],
        ["--concurrency", "0"],
        ["--max-tokens", "2junk"],
        ["--timeout-ms", "-1"],
        ["--max-cost", "20"],
        ["--max-cost", "Infinity"],
        ["--models", ""],
        ["--evals", ""],
        ["--seed", "-1"],
    ])
        assert.throws(() => parseArgs(args));
});
test("CLI preserves process failure exit status", () => {
    const result = spawnSync(
        process.execPath,
        ["operations/model-evals/cli.mjs", "--questions", "NaN"],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /positive integer/);
});
