import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

test("local reader setup preserves the approved signing secret and selects staging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "economics-dev-vars-test-"));
    try {
        await mkdir(join(dir, "scripts"));
        const script = join(dir, "scripts/write-dev-vars.mjs");
        await copyFile(
            new URL("./write-dev-vars.mjs", import.meta.url),
            script,
        );
        await writeFile(
            join(dir, ".dev.vars"),
            'POLLINATIONS_AUTH_SESSION_SECRET="test-only-existing-secret"\nTINYBIRD_POLLEN_PIPE="wrong"\n',
        );
        execFileSync(process.execPath, [script], {
            env: {
                ...process.env,
                TINYBIRD_ECONOMICS_READ_TOKEN: "test-only-staging-reader",
            },
            stdio: "pipe",
        });
        const vars = await readFile(join(dir, ".dev.vars"), "utf8");
        assert.match(
            vars,
            /POLLINATIONS_AUTH_SESSION_SECRET="test-only-existing-secret"/,
        );
        assert.match(
            vars,
            /TINYBIRD_ECONOMICS_READ_TOKEN="test-only-staging-reader"/,
        );
        assert.match(
            vars,
            /TINYBIRD_POLLEN_PIPE="economics_pollen_usage_snapshot_api"/,
        );
        assert.equal((await stat(join(dir, ".dev.vars"))).mode & 0o777, 0o600);
        await rm(join(dir, ".dev.vars"));
        assert.throws(
            () => execFileSync(process.execPath, [script], { stdio: "pipe" }),
            /approved local POLLINATIONS_AUTH_SESSION_SECRET/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
