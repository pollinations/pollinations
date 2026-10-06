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
        "enter.pollinations.ai/drizzle/0068_model-permission-categories.sql",
    ]);
    assert.ok(
        filters.gen.includes(filters.canonical_permissions[0]),
        "migration-only repairs must also deploy Gen so final cleanup can run",
    );
    const command = job.steps.find(
        (step) => step.name === "Finalize canonical model permissions",
    );
    assert.equal(command["working-directory"], "enter.pollinations.ai");
    assert.equal(
        command.run,
        "npx wrangler d1 execute DB --remote --env production --file drizzle/0068_model-permission-categories.sql",
    );
});
