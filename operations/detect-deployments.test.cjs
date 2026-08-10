const assert = require("node:assert/strict");
const test = require("node:test");

const { detectDeployments } = require("./detect-deployments.cjs");

const manifest = {
    economics: {
        paths: ["operations/economics/", "packages/ui/", "packages/sdk/"],
    },
    "model-monitor": {
        paths: ["operations/model-monitor/", "packages/ui/", "packages/sdk/"],
    },
    observability: { paths: ["operations/observability/"] },
};

test("maps direct operation changes", () => {
    assert.deepEqual(
        detectDeployments(["operations/model-monitor/src/App.jsx"], manifest),
        ["model-monitor"],
    );
});

test("maps shared package changes to their consumers", () => {
    assert.deepEqual(
        detectDeployments(["packages/ui/src/index.ts"], manifest),
        ["economics", "model-monitor"],
    );
});

test("deploys every operation when deployment controls change", () => {
    assert.deepEqual(
        detectDeployments(["operations/deployments.json"], manifest),
        ["economics", "model-monitor", "observability"],
    );
});

test("ignores unrelated operation changes", () => {
    assert.deepEqual(
        detectDeployments(["operations/community-monitor/CYCLE.md"], manifest),
        [],
    );
});
