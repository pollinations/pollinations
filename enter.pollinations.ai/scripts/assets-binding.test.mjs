import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";

// Enter is gen's dispatch-namespace outbound Worker, so an assets binding
// breaks its deployments (#18189, #18552). Runs on every PR, unlike the
// Enter Vitest job, which skips config-only changes.
const config = fileURLToPath(new URL("../wrangler.toml", import.meta.url));

for (const env of ["production", "staging"]) {
    test(`${env} has no assets binding`, () => {
        const { assets } = unstable_readConfig(
            { config, env },
            { hideWarnings: true },
        );
        assert.equal(assets?.binding, undefined);
    });
}
