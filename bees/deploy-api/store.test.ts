import assert from "node:assert/strict";
import { test } from "node:test";

import type { DeployManifest } from "./manifest-deploy.ts";
import {
    DeployStore,
    deploymentIdFromName,
    IdempotencyConflictError,
    InvalidTransitionError,
    NotFoundError,
    projectSurfaceUrls,
} from "./store.ts";

const VALID: DeployManifest = {
    id: "catgpt-clone",
    display_name: "CatGPT clone",
    description: "test",
    model: "claude-fast",
    surfaces: ["openai", "web"],
    state: { scope: "per-user" },
    billing: { default: "user-pays", clientId: "pk_real_key_abc" },
    name: "my-catgpt-clone",
    source: { type: "git", repository: "https://github.com/me/bee.git" },
};

test("deploymentIdFromName uses the name verbatim (validated kebab)", () => {
    assert.equal(
        deploymentIdFromName("my-catgpt-clone"),
        "bee_my-catgpt-clone",
    );
});

test("projectSurfaceUrls covers all six surface kinds", () => {
    const urls = projectSurfaceUrls("https://gen.pollinations.ai", "bee_x", [
        "openai",
        "web",
        "discord",
        "a2a",
        "rest",
        "cli",
    ]);
    assert.equal(urls.length, 6);
    assert.match(urls[0].url, /v1\/chat\/completions$/);
    assert.match(urls[3].url, /agent-card\.json$/);
    assert.match(urls[4].url, /\/run$/);
    assert.match(urls[5].url, /\/cli\/exec$/);
});

test("create persists deployment, projects URLs, and emits a created event", () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    assert.equal(dep.id, "bee_my-catgpt-clone");
    assert.equal(dep.status, "queued");
    assert.equal(dep.surfaces.length, 2);
    const events = store.events(dep.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "deployment_created");
    assert.equal(events[0].toStatus, "queued");
});

test("create throws IdempotencyConflictError on duplicate name", () => {
    const store = new DeployStore();
    store.create(VALID);
    assert.throws(() => store.create(VALID), IdempotencyConflictError);
});

test("create with upgrade=true updates in place and emits deployment_updated", () => {
    const store = new DeployStore();
    const first = store.create(VALID);
    const second = store.create(
        { ...VALID, description: "updated description" },
        { upgrade: true },
    );
    assert.equal(first.id, second.id);
    assert.equal(second.manifest.description, "updated description");
    assert.equal(first.createdAt, second.createdAt, "createdAt is preserved");
    const events = store.events(first.id);
    assert.equal(events.length, 2);
    assert.equal(events[1].type, "deployment_updated");
});

test("create rejects invalid manifests with errors attached", () => {
    const store = new DeployStore();
    try {
        store.create({ ...VALID, name: "INVALID_NAME" } as any);
        assert.fail("expected throw");
    } catch (err) {
        assert.ok((err as Error & { errors?: string[] }).errors);
        assert.match((err as Error).message, /invalid manifest/);
    }
});

test("transition follows the allowed state machine", () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    const id = dep.id;

    const building = store.transition(id, "building", { message: "fetching" });
    assert.equal(building.status, "building");

    const ready = store.transition(id, "ready");
    assert.equal(ready.status, "ready");

    // ready → building is allowed (re-deploy)
    const redeploying = store.transition(id, "building");
    assert.equal(redeploying.status, "building");

    const events = store.events(id);
    // 1 created + 3 transitions = 4
    assert.equal(events.length, 4);
});

test("transition rejects illegal transitions", () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    // queued → ready is illegal (must go through building)
    assert.throws(
        () => store.transition(dep.id, "ready"),
        InvalidTransitionError,
    );
});

test("transition records lastError on failed status", () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    store.transition(dep.id, "building");
    const failed = store.transition(dep.id, "failed", {
        lastError: "build script exited 1",
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "build script exited 1");

    // failed → queued is allowed (retry); lastError clears
    const retried = store.transition(dep.id, "queued");
    assert.equal(retried.lastError, undefined);
});

test("update merges patch onto current manifest and re-deploys", () => {
    const store = new DeployStore();
    store.create(VALID);
    const updated = store.update("bee_my-catgpt-clone", {
        billing: { default: "author-pays" },
    });
    assert.equal(updated.manifest.billing.default, "author-pays");
    // surfaces come from the original manifest
    assert.equal(updated.manifest.surfaces.length, 2);
});

test("update on missing deployment throws NotFoundError", () => {
    const store = new DeployStore();
    assert.throws(() => store.update("bee_does-not-exist", {}), NotFoundError);
});

test("delete soft-deletes and emits a final event", () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    assert.equal(store.delete(dep.id), true);
    const after = store.get(dep.id);
    assert.equal(after?.status, "deleted");
    const events = store.events(dep.id);
    assert.equal(events.at(-1)?.toStatus, "deleted");

    // double-delete returns false (already terminal)
    assert.equal(store.delete(dep.id), false);
});

test("events?since filters to only newer events", async () => {
    const store = new DeployStore();
    const dep = store.create(VALID);
    // Capture cutoff after the first event (small delay so timestamps tick).
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    store.transition(dep.id, "building");
    const after = store.events(dep.id, { since: cutoff });
    assert.equal(after.length, 1);
    assert.equal(after[0].toStatus, "building");
});
