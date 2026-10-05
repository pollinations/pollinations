import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const runner = new URL("verify-stack.mjs", import.meta.url).pathname;

test("Manual validation explains its scope without credentials", () => {
    const result = spawnSync(process.execPath, [runner, "--help"], {
        encoding: "utf8",
        env: { PATH: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
        result.stdout,
        /no automatic edits, PRs or production registration/,
    );
});

test("Missing runtime access fails before renting a VM and records the reason", async () => {
    const out = await mkdtemp(join(tmpdir(), "model-resolver-validation-"));
    try {
        const result = spawnSync(process.execPath, [runner, "--out", out], {
            encoding: "utf8",
            env: { PATH: "", POLLINATIONS_API_KEY: "" },
        });
        assert.equal(result.status, 1, result.stderr);
        const proof = JSON.parse(
            await readFile(join(out, "verification.json"), "utf8"),
        );
        assert.equal(proof.status, "failed");
        assert.match(proof.error, /Existing POLLINATIONS_API_KEY required/);
        assert.equal(proof.sandboxId, undefined);
        assert.deepEqual(proof.stages, []);
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});
