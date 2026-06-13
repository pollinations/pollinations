// Cross-validation: run codex's `bee.json` examples (from PR #10636) through
// our validator. Documents the concrete schema divergences as assertions.
//
// Why a test rather than a comment in COMPARISON.md? Because tests fail
// loudly when either side moves. If codex renames `billing.mode` to
// `billing.default` (or vice versa), this test starts passing more
// fixtures and we know convergence happened. If they rename a field that
// currently passes, the test breaks and we know the schemas diverged
// further.
//
// The fixtures under test-fixtures/ are vendored copies of codex's checked-in
// bee.json files at:
//   - bees/minimal-cloudflare-agents/bee.json
//   - bees/minimal-daytona-container/bee.json
//   - bees/minimal-aws-agentcore/bee.json
//   - bees/musician-booking-reference/bee.json
// from branch codex/musician-booking-agent-reference (PR #10636).
//
// Refresh procedure if you suspect drift:
//   gh api repos/pollinations/pollinations/contents/bees/<path>/bee.json?ref=codex/musician-booking-agent-reference \
//     -H "Accept: application/vnd.github.raw" \
//     > bees/deploy-api/test-fixtures/codex-<name>.json

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateDeployManifest } from "./manifest-deploy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "test-fixtures");

function loadFixture(name: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const FIXTURES = [
    "codex-minimal-cloudflare-agents.json",
    "codex-minimal-daytona-container.json",
    "codex-minimal-aws-agentcore.json",
    "codex-musician-booking.json",
] as const;

test("codex fixtures load cleanly as JSON", () => {
    for (const f of FIXTURES) {
        const m = loadFixture(f) as Record<string, unknown>;
        assert.ok(m.name, `${f} should have a name`);
        assert.ok(m.source, `${f} should have a source`);
        assert.ok(m.billing, `${f} should have a billing block`);
    }
});

test("codex fixtures all use billing.mode (their schema), not billing.default (ours)", () => {
    // Documents the active divergence. If codex renames to `default` (or we
    // rename to `mode`), this assertion flips and we know which side moved.
    for (const f of FIXTURES) {
        const m = loadFixture(f) as { billing: Record<string, unknown> };
        assert.ok(
            "mode" in m.billing,
            `${f} expected billing.mode in codex schema`,
        );
        assert.equal(
            "default" in m.billing,
            false,
            `${f} should not yet use billing.default — that's our shape`,
        );
    }
});

test("codex fixtures all use clientId: pk_replace_me (placeholder)", () => {
    // Their CLI's `init` writes pk_replace_me as the placeholder. Ours
    // rejects this at validate time — by design. Documenting both sides.
    for (const f of FIXTURES) {
        const m = loadFixture(f) as {
            billing: { clientId?: string };
        };
        assert.equal(
            m.billing.clientId,
            "pk_replace_me",
            `${f} expected pk_replace_me placeholder`,
        );
    }
});

test("codex fixtures use retentionDays (camelCase), not retention_days (snake)", () => {
    // Only the daytona + agentcore fixtures have state.retentionDays; the
    // cloudflare and musician-booking ones omit state entirely.
    for (const f of [
        "codex-minimal-daytona-container.json",
        "codex-minimal-aws-agentcore.json",
    ]) {
        const m = loadFixture(f) as { state?: Record<string, unknown> };
        assert.ok(m.state, `${f} should have state`);
        assert.ok(
            "retentionDays" in (m.state as Record<string, unknown>),
            `${f} expected camelCase retentionDays`,
        );
        assert.equal(
            "retention_days" in (m.state as Record<string, unknown>),
            false,
            `${f} should not use snake_case`,
        );
    }
});

test("our validator rejects every codex fixture — schema split is real", () => {
    // This is the load-bearing test. Each codex bee.json fails our validator
    // because their shape is the *deploy-time input* (name, source,
    // billing.mode, billing.clientId) and ours is the *runtime/registry
    // type* (id, model, state.scope, billing.default).
    //
    // The platform needs both layers — a deploy-time validator that runs on
    // bee.json, then a runtime validator that runs on the resolved
    // AgentManifest. This test asserts the layers are still distinct.
    for (const f of FIXTURES) {
        const errors = validateDeployManifest(loadFixture(f) as never);
        assert.ok(
            errors.length > 0,
            `${f} should fail our validator (schemas diverge by design)`,
        );
    }
});

test("expected errors per fixture document exactly what diverges", () => {
    // Snapshot the error categories. If codex moves fields toward our
    // shape, these snapshots break loudly — that's the signal we want.
    for (const f of FIXTURES) {
        const errors = validateDeployManifest(loadFixture(f) as never);
        const joined = errors.join("\n");

        // All fixtures lack id/display_name/description/model/state.scope
        // because those are runtime-registry concerns, not deploy-time.
        assert.match(joined, /id/, `${f}: expected error about id`);
        assert.match(joined, /model/, `${f}: expected error about model`);

        // Most fixtures use billing.mode rather than billing.default; our
        // validator complains about a missing/unknown billing.default.
        assert.match(
            joined,
            /billing\.default|user-pays/,
            `${f}: expected error about billing.default`,
        );

        // pk_replace_me is the canonical placeholder — but our placeholder
        // check only fires when billing.default is set to "user-pays".
        // Since codex's manifests use billing.mode, the upstream
        // billing.default check fires first and the placeholder check
        // doesn't get a chance. That's a real divergence in *layering* —
        // we'd only catch the placeholder if we taught our validator to
        // accept billing.mode as a fallback synonym, which we won't do
        // because the fields mean different things in each layer.
    }
});

test("projected codex manifest passes with realistic clientId; placeholder still rejected", () => {
    // Synthetic test: project codex's daytona-container fixture into our
    // shape. Demonstrates that the schemas aren't *contradictory* — they
    // just describe different layers. A real platform implementation
    // would do this projection in the deploy API.
    const codex = loadFixture("codex-minimal-daytona-container.json") as any;

    function project(opts: { clientId: string; name: string; source: any }) {
        return {
            id: codex.name,
            display_name: codex.name,
            description: `Projected from codex bee.json: ${codex.name}`,
            model: "claude-fast", // implicit on codex side; explicit on ours
            surfaces: codex.surfaces,
            runtime: codex.runtime,
            state: {
                scope: "per-user" as const,
                backend: codex.state.backend,
                retention_days: codex.state.retentionDays,
            },
            billing: {
                default: codex.billing.mode, // billing.mode → billing.default
                clientId: opts.clientId,
                dailyPollenLimit: codex.billing.dailyPollenLimit,
            },
            // Required by our DeployManifest extension; codex always has these:
            name: opts.name,
            source: opts.source,
        };
    }

    // 1. With pk_replace_me (codex's placeholder), our validator rejects.
    //    This is the F3 placeholder guardrail in action — confirms the
    //    behavior holds even on cross-validated manifests.
    const placeholderErrors = validateDeployManifest(
        project({
            clientId: "pk_replace_me",
            name: codex.name,
            source: codex.source,
        }) as never,
    );
    assert.ok(
        placeholderErrors.some((e) => e.includes("placeholder")),
        "pk_replace_me should still be flagged as a placeholder",
    );

    // 2. With a realistic key, the projection validates clean.
    const okErrors = validateDeployManifest(
        project({
            clientId: "pk_real_app_key_abc123",
            name: codex.name,
            source: codex.source,
        }) as never,
    );
    assert.deepEqual(
        okErrors,
        [],
        `projection with realistic clientId should validate, got: ${okErrors.join("; ")}`,
    );
});
