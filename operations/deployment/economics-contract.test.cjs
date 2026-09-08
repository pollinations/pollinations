const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");

test("Economics deployment checker loads TypeScript before requesting credentials", () => {
    const economics = resolve(__dirname, "../economics");
    const manifest = JSON.parse(
        readFileSync(resolve(economics, "deploy.json"), "utf8"),
    );
    // Exercise the real checker launcher without credentials or deployment.
    const [runtime, ...args] = manifest.deploy
        .split("'")[1]
        .split(" --secrets-file")[0]
        .split(" ");
    assert.equal(runtime, "node");
    const result = spawnSync(process.execPath, args, {
        cwd: economics,
        encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--secrets-file is required/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});
