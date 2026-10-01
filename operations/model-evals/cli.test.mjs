import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main, parseArgs } from "./cli.mjs";

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

test("CLI auth failure exits nonzero, marks diagnostics incomplete and leaves history untouched", async () => {
    const originalFetch = globalThis.fetch;
    const dir = await mkdtemp(join(tmpdir(), "eval-auth-test-"));
    try {
        globalThis.fetch = async (url) =>
            url.endsWith("/text/models")
                ? {
                      ok: true,
                      json: async () => [
                          {
                              name: "test",
                              category: "text",
                              pricing: { currency: "pollen" },
                          },
                      ],
                  }
                : {
                      ok: false,
                      status: 401,
                      text: async () =>
                          JSON.stringify({
                              error: { message: "invalid test key" },
                          }),
                  };
        const out = join(dir, "latest.json");
        const history = join(dir, "history.json");
        const code = await main([
            "--api-key",
            "test-key",
            "--out",
            out,
            "--history",
            history,
            "--quiet",
        ]);
        assert.equal(code, 1);
        const run = JSON.parse(await readFile(out, "utf8"));
        assert.equal(run.complete, false);
        assert.equal(run.scoredCount, 0);
        assert.match(run.requestError, /HTTP 401/);
        await assert.rejects(access(history));
    } finally {
        globalThis.fetch = originalFetch;
        await rm(dir, { recursive: true, force: true });
    }
});
