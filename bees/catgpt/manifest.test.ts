import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { catgpt, resolveManifest, validateManifest } from "./manifest.ts";

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

test("validateManifest only accepts worker and container as runtime kinds", () => {
    // Old runtime kinds like "cloudflare-agent" are no longer allowed.
    const errors = validateManifest({
        ...catgpt,
        runtime: { kind: "cloudflare-agent" } as any,
    });
    assert.ok(errors.some((e) => e.includes("cloudflare-agent")));
});

test("validateManifest accepts known state.backend values", () => {
    for (const backend of [
        "memory",
        "kv",
        "durable-object",
        "sqlite",
    ] as const) {
        const errors = validateManifest({
            ...catgpt,
            state: { ...catgpt.state, backend },
        });
        assert.deepEqual(errors, [], `backend ${backend} should be accepted`);
    }
});

test("validateManifest rejects unknown state.backend", () => {
    const errors = validateManifest({
        ...catgpt,
        state: { ...catgpt.state, backend: "carrier-pigeon" } as any,
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

// Schema convergence with codex's PR #10636 (commit 98ceda347): sparse
// authoring manifests are valid; resolveManifest fills in defaults.

test("validateManifest accepts manifests without runtime (defaults to worker)", () => {
    const { runtime, ...withoutRuntime } = catgpt;
    const errors = validateManifest(withoutRuntime as any);
    assert.deepEqual(
        errors,
        [],
        "missing runtime should be valid — codex defaults to worker",
    );
});

test("validateManifest accepts manifests without state.backend", () => {
    const errors = validateManifest({
        ...catgpt,
        state: { scope: "per-user" },
    });
    assert.deepEqual(
        errors,
        [],
        "missing state.backend should be valid — codex defaults to sqlite",
    );
});

test("resolveManifest fills in runtime: worker when absent", () => {
    const { runtime, ...sparse } = catgpt;
    const { resolved, errors } = resolveManifest(sparse as any);
    assert.deepEqual(errors, []);
    assert.equal(resolved.runtime.kind, "worker");
});

test("resolveManifest fills in state.backend: sqlite when absent", () => {
    const { resolved } = resolveManifest({
        ...catgpt,
        state: { scope: "per-user" },
    });
    assert.equal(resolved.state.backend, "sqlite");
});

test("resolveManifest preserves explicit runtime and state.backend", () => {
    const { resolved } = resolveManifest({
        ...catgpt,
        runtime: { kind: "container" },
        state: { scope: "per-user", backend: "durable-object" },
    });
    assert.equal(resolved.runtime.kind, "container");
    assert.equal(resolved.state.backend, "durable-object");
});

test("resolveManifest does not mutate its input", () => {
    const { runtime, ...sparse } = catgpt;
    const before = JSON.stringify(sparse);
    resolveManifest(sparse as any);
    assert.equal(JSON.stringify(sparse), before);
});

test("resolveManifest returns the same errors validateManifest produces", () => {
    const broken = { ...catgpt, model: 0 } as any;
    const { errors } = resolveManifest(broken);
    assert.deepEqual(errors, validateManifest(broken));
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
