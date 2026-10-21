import assert from "node:assert/strict";
import test from "node:test";
import { buildExtAppsScript } from "../scripts/build-ext-apps.js";
import { EXT_APPS_SCRIPT } from "../src/ui/extApps.generated.js";

test("the inlined MCP Apps SDK matches the installed package", async () => {
    assert.equal(
        EXT_APPS_SCRIPT,
        await buildExtAppsScript(),
        "Run node scripts/build-ext-apps.js",
    );
});
