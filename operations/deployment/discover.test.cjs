const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { discover, selectChanged } = require("./discover.cjs");

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-discovery-"));
    fs.mkdirSync(path.join(root, "apps", "chat"), { recursive: true });
    fs.mkdirSync(path.join(root, "apps", "plain"), { recursive: true });
    fs.mkdirSync(path.join(root, "operations", "kpi"), { recursive: true });
    fs.writeFileSync(
        path.join(root, "apps", "chat", "deploy.json"),
        JSON.stringify({
            target: "pages",
            credentials: "apps",
            watch: ["packages/ui/"],
        }),
    );
    fs.writeFileSync(
        path.join(root, "operations", "kpi", "deploy.json"),
        JSON.stringify({ target: "worker", credentials: "myceli" }),
    );
    return root;
}

test("discovers only directories with valid manifests", () => {
    const root = fixture();
    assert.deepEqual(
        discover("apps", root).map((app) => app.path),
        ["apps/chat"],
    );
    assert.deepEqual(
        discover("operations", root).map((app) => app.path),
        ["operations/kpi"],
    );
    assert.deepEqual(
        discover("all", root).map((app) => app.path),
        ["apps/chat", "operations/kpi"],
    );
    fs.rmSync(root, { recursive: true, force: true });
});

test("selects direct and shared dependency changes", () => {
    const root = fixture();
    const apps = discover("apps", root);
    assert.equal(selectChanged(apps, ["apps/chat/src/App.tsx"]).length, 1);
    assert.equal(selectChanged(apps, ["packages/ui/src/index.ts"]).length, 1);
    assert.equal(selectChanged(apps, ["README.md"]).length, 0);
    assert.equal(
        selectChanged(apps, ["operations/deployment/deploy.sh"]).length,
        1,
    );
    fs.rmSync(root, { recursive: true, force: true });
});
