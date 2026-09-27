import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Harmless sentinels exercise the actual Docker context used by Wrangler.
// Seed only a disposable checkout: never overwrite a developer's local files.
const excluded = [
    "enter.pollinations.ai/.dev.vars",
    "enter.pollinations.ai/.dev.vars.preview",
    "enter.pollinations.ai/.testingtokens",
    "enter.pollinations.ai/.wrangler/flow-build-sentinel",
    "enter.pollinations.ai/secrets/flow-build-sentinel",
    "operations/flow/.local/flow-build-sentinel",
    "operations/flow/.claude/flow-build-sentinel",
    "operations/flow/.env.preview",
    "operations/flow/flow-build-sentinel.pem",
    "operations/flow/flow-build-sentinel.key",
    "apps/react/flow-build-sentinel",
    "operations/economics/web/flow-build-sentinel",
];

if (process.argv[2] === "seed") {
    for (const path of excluded) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, "Inert Docker exclusion test.\n", { flag: "wx" });
    }
} else {
    assert.equal(process.argv[2], "verify", "Choose seed or verify");
    for (const path of excluded)
        assert.equal(existsSync(path), false, `Excluded file shipped: ${path}`);
    for (const path of [
        "enter.pollinations.ai/src/index.ts",
        "operations/flow/dist-live/operations/flow/flow-flows.html",
        "operations/flow/dist-runtime/workers.json",
        "apps/react/package.json",
        "operations/economics/web/package.json",
    ])
        assert(existsSync(path), `Required runtime file missing: ${path}`);
    console.log("Flow image includes product code and excludes local state.");
}
