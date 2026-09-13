const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");
const { discover, selectChanged } = require("./discover.cjs");

const root = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workflow = parse(read(".github/workflows/deploy-applications.yml"));
const manifest = JSON.parse(read("apps/floret/deploy.json"));

// Exercise the existing deployment discovery and its actual exclusion filters.
test("Applications selects Floret on promotion and manual retry", () => {
    assert.deepEqual(workflow.on.push.branches, ["production"]);
    assert.ok(workflow.on.push.paths.includes("apps/**"));
    const apps = discover("apps", root);
    const selected = selectChanged(apps, ["apps/floret/worker.js"]);
    assert.deepEqual(
        selected.map((app) => app.path),
        ["apps/floret"],
    );
    const script = workflow.jobs.detect.steps.find(
        (step) => step.id === "detect",
    ).run;
    assert.ok(script.includes('"$GITHUB_REF" != "refs/heads/production"'));
    assert.ok(script.includes('--app="$SELECTED_APP"'));
    let result = selected;
    for (const match of script.matchAll(
        /APPS=\$\(node -e '([^']+)' "\$APPS"\)/g,
    )) {
        result = JSON.parse(
            execFileSync(
                process.execPath,
                ["-e", match[1], JSON.stringify(result)],
                { encoding: "utf8" },
            ),
        );
    }
    assert.deepEqual(result, selected);
    assert.equal(result[0].credentials, "myceli");
    assert.equal(result[0].docker, true);
    assert.ok(
        workflow.jobs.deploy.steps.some(
            (step) =>
                step.if === "matrix.app.docker" && step.run === "docker info",
        ),
    );
    const deploy = workflow.jobs.deploy.steps.find((step) =>
        step.run?.includes("operations/deployment/deploy.sh"),
    );
    assert.ok(
        deploy.env.CLOUDFLARE_API_TOKEN.includes(
            "secrets.CLOUDFLARE_API_TOKEN_MYCELI",
        ),
    );
    assert.ok(
        deploy.env.CLOUDFLARE_ACCOUNT_ID.includes(
            "secrets.CLOUDFLARE_ACCOUNT_ID_MYCELI",
        ),
    );
});

test("Floret deploy has local locked Wrangler and verifies both existing domains", () => {
    const pkg = JSON.parse(read("apps/floret/package.json"));
    const lock = JSON.parse(read("apps/floret/package-lock.json"));
    assert.equal(manifest.install, "npm ci --workspaces=false");
    assert.equal(manifest.deploy, "npm run deploy");
    assert.equal(pkg.scripts.deploy, "wrangler deploy");
    assert.match(pkg.devDependencies.wrangler, /^\d+\.\d+\.\d+$/);
    assert.equal(
        lock.packages["node_modules/wrangler"].version,
        pkg.devDependencies.wrangler,
    );
    assert.equal(manifest.subdomain, "floret");
    for (const domain of ["floret.myceli.ai", "floret.pollinations.ai"]) {
        assert.ok(manifest.verify.includes(`https://${domain}/health`));
        assert.ok(manifest.verify.includes(`https://${domain}/v1/models`));
    }
});

test("Floret preserves production account, domains, and both Container bindings", () => {
    const config = JSON.parse(
        read("apps/floret/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""),
    );
    assert.equal(config.account_id, "b6ec751c0862027ba269faf7029b2501");
    assert.equal(config.name, "floret");
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.routes, undefined);
    assert.equal(config.route, undefined);
    assert.deepEqual(
        config.containers.map((item) => item.class_name),
        ["FloretContainer", "FloretShellContainer"],
    );
    assert.deepEqual(
        config.durable_objects.bindings.map((item) => item.name),
        ["FLORET", "FLORET_SHELL", "FLORET_CATALOG"],
    );
});
