import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

test("hosted listing update runs only after both production workers deploy", () => {
    const workflow = parse(
        readFileSync(
            new URL(
                "../../.github/workflows/deploy-cloudflare-production.yml",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    const job = workflow.jobs["configure-hosted-agents"];
    assert.deepEqual(job.needs, ["changes", "deploy-enter", "deploy-gen"]);
    for (const prerequisite of [
        "github.ref == 'refs/heads/production'",
        "agent_listings == 'true'",
        "deploy-enter.result == 'success'",
        "deploy-gen.result == 'success'",
    ]) {
        assert.ok(job.if.includes(prerequisite));
    }
    assert.equal(
        workflow.on.workflow_dispatch.inputs.configure_hosted_agents.default,
        false,
    );
    const filters = parse(
        workflow.jobs.changes.steps.find((step) => step.id === "filter").with
            .filters,
    );
    const sqlPath = "enter.pollinations.ai/scripts/configure-hosted-agents.sql";
    assert.deepEqual(filters.agent_listings, [sqlPath]);
    assert.ok(filters.enter.includes("enter.pollinations.ai/**"));
    assert.ok(filters.gen.includes(sqlPath));
    const writeIndex = job.steps.findIndex((step) =>
        step.run?.includes("wrangler d1 execute"),
    );
    assert.equal(
        job.steps[writeIndex]["working-directory"],
        "enter.pollinations.ai",
    );
    assert.equal(
        job.steps[writeIndex].run,
        "npx wrangler d1 execute DB --remote --env production --file scripts/configure-hosted-agents.sql",
    );
    assert.equal(
        job.steps[writeIndex + 1].run,
        "node enter.pollinations.ai/scripts/verify-hosted-agents.mjs",
    );
});
