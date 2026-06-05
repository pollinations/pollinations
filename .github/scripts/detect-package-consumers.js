#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_PATHS = [
    ["packages/sdk/", "@pollinations/sdk"],
    ["packages/ui/", "@pollinations/ui"],
];

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

function readChangedFiles() {
    const args = process.argv.slice(2).filter(Boolean);
    if (args.length > 0) return args;

    if (process.env.CHANGED) {
        return process.env.CHANGED.split(/\n+/).filter(Boolean);
    }

    if (!process.stdin.isTTY) {
        return fs.readFileSync(0, "utf8").split(/\n+/).filter(Boolean);
    }

    return [];
}

function detectPackageConsumers(changedFiles, repoRoot = DEFAULT_REPO_ROOT) {
    const changedPackages = new Set(
        PACKAGE_PATHS.filter(([prefix]) =>
            changedFiles.some((file) => file.startsWith(prefix)),
        ).map(([, packageName]) => packageName),
    );

    if (changedPackages.size === 0) return [];

    const appsPath = path.join(repoRoot, "apps", "apps.json");
    const apps = JSON.parse(fs.readFileSync(appsPath, "utf8"));

    return Object.keys(apps)
        .filter((name) => name !== "_defaults")
        .sort()
        .filter((app) => {
            const packagePath = path.join(
                repoRoot,
                "apps",
                app,
                "package.json",
            );
            if (!fs.existsSync(packagePath)) return false;

            const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
            const dependencies = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
                ...pkg.peerDependencies,
                ...pkg.optionalDependencies,
            };

            return [...changedPackages].some(
                (packageName) => dependencies[packageName],
            );
        });
}

if (require.main === module) {
    for (const app of detectPackageConsumers(
        readChangedFiles(),
        process.env.REPO_ROOT || DEFAULT_REPO_ROOT,
    )) {
        console.log(app);
    }
}

module.exports = { detectPackageConsumers };
