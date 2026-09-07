const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const workflow = parse(
    fs.readFileSync(
        path.join(
            __dirname,
            "../../.github/workflows/deploy-cloudflare-production.yml",
        ),
        "utf8",
    ),
);

test("canonical promotion fails closed before D1 unless live compatibility is confirmed", () => {
    const gate = workflow.jobs.migrate.steps[0];
    assert.equal(
        gate.if,
        undefined,
        "manual retries must not bypass the compatibility gate",
    );
    assert.equal(
        gate.env.COMPAT_VERIFIED,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not JavaScript interpolation.
        "${{ vars.CANONICAL_MODEL_PERMISSION_COMPAT_VERIFIED }}",
    );
    assert.ok(gate.run.includes('if [ "$COMPAT_VERIFIED" != "true" ]'));
    assert.ok(gate.run.includes("exit 1"));
});

test("canonical cleanup waits for both successful deployments and requires promotion or explicit retry", () => {
    const job = workflow.jobs["finalize-canonical-permissions"];
    assert.deepEqual(job.needs, ["changes", "deploy-enter", "deploy-gen"]);
    for (const prerequisite of [
        "canonical_permissions == 'true'",
        "deploy-enter.result == 'success'",
        "deploy-gen.result == 'success'",
    ]) {
        assert.ok(job.if.includes(prerequisite));
    }
    assert.equal(
        workflow.on.workflow_dispatch.inputs.finalize_canonical_permissions
            .default,
        false,
    );
    const filters = parse(
        workflow.jobs.changes.steps.find((step) => step.id === "filter").with
            .filters,
    );
    assert.deepEqual(filters.canonical_permissions, [
        "enter.pollinations.ai/drizzle/0062_standardize-model-permissions.sql",
    ]);
    const command = job.steps.find(
        (step) => step.name === "Finalize canonical model permissions",
    );
    assert.equal(command["working-directory"], "enter.pollinations.ai");
    assert.equal(
        command.run,
        "npx wrangler d1 execute DB --remote --env production --file drizzle/0062_standardize-model-permissions.sql",
    );
});
