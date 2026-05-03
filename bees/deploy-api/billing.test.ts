import assert from "node:assert/strict";
import { test } from "node:test";

import { estimateBilling, requiredScopes } from "./billing.ts";
import { resolveDeployManifest } from "./manifest-deploy.ts";

const WORKER = resolveDeployManifest({
    id: "x",
    display_name: "x",
    description: "x",
    model: "claude-fast",
    surfaces: ["openai", "web"],
    state: { scope: "per-user" },
    billing: { default: "user-pays", clientId: "pk_real_key" },
    name: "worker-bee",
    source: { type: "git", repository: "https://github.com/me/r.git" },
}).resolved;

const CONTAINER = resolveDeployManifest({
    id: "x",
    display_name: "x",
    description: "x",
    model: "claude-sonnet-4-6",
    surfaces: ["web", "discord"],
    runtime: { kind: "container" },
    state: { scope: "per-user" },
    billing: { default: "author-pays" },
    name: "container-bee",
    source: { type: "git", repository: "https://github.com/me/r.git" },
}).resolved;

test("worker billing has 3 meters; no runtime_compute or workspace_storage", () => {
    const e = estimateBilling(WORKER);
    assert.equal(e.meters.length, 3);
    assert.ok(e.meters.every((m) => m.name !== "runtime_compute"));
    assert.ok(e.meters.every((m) => m.name !== "workspace_storage"));
});

test("container billing adds runtime_compute and workspace_storage", () => {
    const e = estimateBilling(CONTAINER);
    assert.equal(e.meters.length, 5);
    assert.ok(e.meters.some((m) => m.name === "runtime_compute"));
    assert.ok(e.meters.some((m) => m.name === "workspace_storage"));
});

test("estimate carries clientId through for user-pays bees", () => {
    const e = estimateBilling(WORKER);
    assert.equal(e.mode, "user-pays");
    assert.equal(e.clientId, "pk_real_key");
});

test("estimate omits clientId for author-pays bees", () => {
    const e = estimateBilling(CONTAINER);
    assert.equal(e.mode, "author-pays");
    assert.equal(e.clientId, undefined);
});

test("every meter has a non-empty note (CLI-printable)", () => {
    for (const e of [estimateBilling(WORKER), estimateBilling(CONTAINER)]) {
        for (const m of e.meters) {
            assert.ok(m.note && m.note.length > 0, `${m.name} missing note`);
        }
    }
});

test("requiredScopes splits developer vs invocation", () => {
    const s = requiredScopes(WORKER);
    assert.deepEqual(s.developer, ["bees:read", "bees:write"]);
    assert.deepEqual(s.invocation, ["generate"]);
});

test("container bees additionally need bees:exec", () => {
    const s = requiredScopes(CONTAINER);
    assert.ok(s.developer.includes("bees:exec"));
});

test("discord surface requires bees:logs", () => {
    const s = requiredScopes(CONTAINER);
    assert.ok(s.developer.includes("bees:logs"));
});

test("author-pays has empty invocation scopes", () => {
    const s = requiredScopes(CONTAINER);
    assert.deepEqual(s.invocation, []);
});
