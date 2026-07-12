const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { detectPackageConsumers } = require("./detect-package-consumers.js");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("detects registered apps that consume changed shared packages", () => {
    const repoRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "pollinations-apps-"),
    );
    writeJson(path.join(repoRoot, "apps", "apps.json"), {
        _defaults: {},
        "model-monitor": {},
        playground: {},
        react: {},
        static: {},
        missingPackage: {},
    });
    writeJson(path.join(repoRoot, "apps", "model-monitor", "package.json"), {
        dependencies: { "@pollinations/ui": "file:../../packages/ui" },
    });
    writeJson(path.join(repoRoot, "apps", "playground", "package.json"), {
        dependencies: { "@pollinations/sdk": "file:../../packages/sdk" },
    });
    writeJson(path.join(repoRoot, "apps", "react", "package.json"), {
        devDependencies: { "@pollinations/ui": "*" },
    });
    writeJson(path.join(repoRoot, "apps", "static", "package.json"), {
        dependencies: { react: "^19.0.0" },
    });

    assert.deepEqual(
        detectPackageConsumers(["packages/ui/src/theme.ts"], repoRoot),
        ["model-monitor", "react"],
    );
    assert.deepEqual(
        detectPackageConsumers(
            ["packages/sdk/src/models.ts", "packages/ui/src/theme.ts"],
            repoRoot,
        ),
        ["model-monitor", "playground", "react"],
    );
    assert.deepEqual(
        detectPackageConsumers(["apps/react/src/App.tsx"], repoRoot),
        [],
    );
});
