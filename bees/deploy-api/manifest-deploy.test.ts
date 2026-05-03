import assert from "node:assert/strict";
import { test } from "node:test";

import {
    type DeployManifest,
    isPlaceholderClientId,
    resolveDeployManifest,
    validateDeployManifest,
} from "./manifest-deploy.ts";

const BASE: DeployManifest = {
    id: "catgpt-clone",
    display_name: "CatGPT clone",
    description: "test",
    model: "claude-fast",
    surfaces: ["openai", "web"],
    state: { scope: "per-user" },
    billing: { default: "user-pays", clientId: "pk_real_app_key_abc" },
    name: "my-catgpt-clone",
    source: { type: "git", repository: "https://github.com/me/bee.git" },
};

test("validates a complete manifest with no errors", () => {
    assert.deepEqual(validateDeployManifest(BASE), []);
});

test("rejects missing name", () => {
    const { name, ...m } = BASE;
    const errs = validateDeployManifest(m as any);
    assert.ok(errs.some((e) => e.includes("name")));
});

test("rejects names with uppercase or underscores", () => {
    for (const bad of ["MyBee", "my_bee", "-bee", "bee-", "BEE"]) {
        const errs = validateDeployManifest({ ...BASE, name: bad });
        assert.ok(
            errs.some((e) => e.includes("name")),
            `expected name "${bad}" to be rejected`,
        );
    }
});

test("rejects missing source", () => {
    const { source, ...m } = BASE;
    const errs = validateDeployManifest(m as any);
    assert.ok(errs.some((e) => e.includes("source")));
});

test("rejects source.type that isn't git/template/bundle", () => {
    const errs = validateDeployManifest({
        ...BASE,
        source: { type: "ftp" } as any,
    });
    assert.ok(errs.some((e) => e.includes("source.type")));
});

test("rejects git source missing repository", () => {
    const errs = validateDeployManifest({
        ...BASE,
        source: { type: "git" } as any,
    });
    assert.ok(errs.some((e) => e.includes("source.repository")));
});

test("accepts template and bundle sources", () => {
    assert.deepEqual(
        validateDeployManifest({
            ...BASE,
            source: { type: "template", template: "musician-booking" },
        }),
        [],
    );
    assert.deepEqual(
        validateDeployManifest({
            ...BASE,
            source: { type: "bundle", uploadId: "upload_abc" },
        }),
        [],
    );
});

test("user-pays without clientId is invalid", () => {
    const errs = validateDeployManifest({
        ...BASE,
        billing: { default: "user-pays" },
    });
    assert.ok(errs.some((e) => e.includes("clientId")));
});

test("rejects placeholder clientIds with a useful message", () => {
    for (const bad of [
        "pk_replace_me",
        "pk_app_key",
        "pk_your_key",
        "pk_xxx",
    ]) {
        const errs = validateDeployManifest({
            ...BASE,
            billing: { default: "user-pays", clientId: bad },
        });
        assert.ok(
            errs.some((e) => e.includes("placeholder") && e.includes(bad)),
            `expected placeholder "${bad}" to be flagged`,
        );
        assert.ok(isPlaceholderClientId(bad));
    }
});

test("rejects sk_ keys in billing.clientId (security guardrail)", () => {
    const errs = validateDeployManifest({
        ...BASE,
        billing: { default: "user-pays", clientId: "sk_secret_key" },
    });
    assert.ok(errs.some((e) => e.includes("pk_")));
});

test("author-pays bees do not require clientId", () => {
    const errs = validateDeployManifest({
        ...BASE,
        billing: { default: "author-pays" },
    });
    assert.deepEqual(errs, []);
});

test("rejects negative or non-numeric dailyPollenLimit", () => {
    for (const bad of [-1, 0, "5", null]) {
        const errs = validateDeployManifest({
            ...BASE,
            billing: { ...BASE.billing, dailyPollenLimit: bad as any },
        });
        assert.ok(errs.some((e) => e.includes("dailyPollenLimit")));
    }
});

test("env must be string→string", () => {
    const errs = validateDeployManifest({
        ...BASE,
        env: { OK: "yes", BAD: 5 as any },
    });
    assert.ok(errs.some((e) => e.includes("env.BAD")));
});

test("resolveDeployManifest fills runtime + state defaults", () => {
    const { runtime, ...withoutRuntime } = BASE;
    const sparse = { ...withoutRuntime, state: { scope: "per-user" as const } };
    const { resolved, errors } = resolveDeployManifest(sparse);
    assert.deepEqual(errors, []);
    assert.equal(resolved.runtime.kind, "worker");
    assert.equal(resolved.state.backend, "sqlite");
    assert.equal(resolved.name, BASE.name);
    assert.equal(resolved.source.type, "git");
});
