import assert from "node:assert/strict";
import { test } from "node:test";

import { validateManifest } from "../catgpt/manifest.ts";
import { codeBee } from "./manifest.ts";

test("code-bee manifest passes validation", () => {
    assert.deepEqual(validateManifest(codeBee), []);
});

test("code-bee uses the container runtime", () => {
    assert.equal(codeBee.runtime.kind, "container");
});

test("code-bee uses sqlite-on-volume state backend", () => {
    assert.equal(codeBee.state.backend, "sqlite");
});

test("code-bee bills user-pays by default (container time is expensive)", () => {
    assert.equal(codeBee.billing.default, "user-pays");
});
