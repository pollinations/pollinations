import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { catgpt, validateManifest } from "./manifest.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("catgpt manifest passes structural validation", () => {
    const errors = validateManifest(catgpt);
    assert.deepEqual(errors, []);
});

test("validateManifest rejects manifests with missing required fields", () => {
    const errors = validateManifest({} as any);
    assert.ok(errors.length > 0, "expected errors for empty manifest");
    assert.ok(errors.some((e) => e.includes("id")));
    assert.ok(errors.some((e) => e.includes("model")));
    assert.ok(errors.some((e) => e.includes("surfaces")));
});

test("validateManifest rejects unknown surface kinds", () => {
    const errors = validateManifest({
        ...catgpt,
        surfaces: ["openai", "smoke-signal"] as any,
    });
    assert.ok(errors.some((e) => e.includes("smoke-signal")));
});

test("validateManifest rejects unknown runtime kinds", () => {
    const errors = validateManifest({
        ...catgpt,
        runtime: { kind: "carrier-pigeon" } as any,
    });
    assert.ok(errors.some((e) => e.includes("carrier-pigeon")));
});

test("validateManifest rejects unknown billing routes", () => {
    const errors = validateManifest({
        ...catgpt,
        billing: { default: "telepathy" } as any,
    });
    assert.ok(errors.some((e) => e.includes("telepathy")));
});

test("validateManifest accepts per-surface billing overrides", () => {
    const errors = validateManifest({
        ...catgpt,
        billing: {
            default: "user-pays",
            per_surface: { openai: "author-pays" },
        },
    });
    assert.deepEqual(errors, []);
});

test("declared surfaces correspond to implemented adapters", () => {
    // If the manifest says we expose a surface, there should be a directory
    // for it under surfaces/. The cli surface lives under surfaces/cli even
    // though the implementations also expose web/discord (those live per
    // variant, not as shared surface adapters yet).
    const adapterRequired: Record<string, string> = {
        openai: "openai-compat",
        a2a: "a2a",
        cli: "cli",
        web: "web-chat",
    };
    for (const surface of catgpt.surfaces) {
        const dir = adapterRequired[surface];
        if (!dir) continue;
        const fullPath = path.join(here, "surfaces", dir);
        assert.ok(
            fs.existsSync(fullPath),
            `surface "${surface}" declared but surfaces/${dir} not found`,
        );
    }
});
