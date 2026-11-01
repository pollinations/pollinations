const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const root = resolve(__dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const workflow = parse(
    read(".github/workflows/deploy-cloudflare-production.yml"),
);

test("infra-watch is deployable through production CI after the shared schema and billing consumers", () => {
    assert.ok(workflow.on.push.paths.includes("operations/infra-watch/**"));
    assert.ok(
        workflow.on.workflow_dispatch.inputs.service.options.includes(
            "infra-watch",
        ),
    );
    const filters = parse(
        workflow.jobs.changes.steps.find(({ id }) => id === "filter").with
            .filters,
    );
    assert.ok(filters.infra_watch.includes("operations/infra-watch/**"));
    assert.ok(filters.infra_watch.includes("enter.pollinations.ai/drizzle/**"));
    assert.match(
        workflow.jobs.migrate.if,
        /needs\.changes\.outputs\.infra_watch == 'true'/,
    );
    const job = workflow.jobs["deploy-infra-watch"];
    for (const dependency of ["migrate", "deploy-enter", "deploy-gen"])
        assert.ok(job.needs.includes(dependency));
    assert.match(job.if, /github\.ref == 'refs\/heads\/production'/);
    assert.match(job.if, /needs\.migrate\.result == 'success'/);
    for (const dependency of ["deploy-enter", "deploy-gen"])
        assert.ok(
            job.if.includes(
                `needs.${dependency}.result == 'success' || needs.${dependency}.result == 'skipped'`,
            ),
        );
    assert.ok(
        job.steps.findIndex(({ run }) => run === "npm test") <
            job.steps.findIndex(({ run }) => run === "npx wrangler deploy"),
    );
});

test("infra-watch deployment retains existing secrets and its local launcher dispatches production CI", () => {
    const job = workflow.jobs["deploy-infra-watch"];
    assert.doesNotMatch(JSON.stringify(job), /secrets-file|sops|secret bulk/);
    const pkg = JSON.parse(read("operations/infra-watch/package.json"));
    assert.match(
        pkg.scripts.deploy,
        /^gh workflow run deploy-cloudflare-production.yml /,
    );
    assert.match(pkg.scripts.deploy, /--ref production/);
    assert.match(pkg.scripts.deploy, /service=infra-watch/);
    assert.doesNotMatch(pkg.scripts.deploy, /wrangler/);
});
