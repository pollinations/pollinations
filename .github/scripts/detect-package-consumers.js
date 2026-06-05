#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_PATHS = [
    ["packages/sdk/", "@pollinations/sdk"],
    ["packages/ui/", "@pollinations/ui"],
];

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

const changedFiles = readChangedFiles();
const changedPackages = new Set(
    PACKAGE_PATHS.filter(([prefix]) =>
        changedFiles.some((file) => file.startsWith(prefix)),
    ).map(([, packageName]) => packageName),
);

if (changedPackages.size === 0) process.exit(0);

const apps = JSON.parse(fs.readFileSync("apps/apps.json", "utf8"));

for (const app of Object.keys(apps)
    .filter((name) => name !== "_defaults")
    .sort()) {
    const packagePath = path.join("apps", app, "package.json");
    if (!fs.existsSync(packagePath)) continue;

    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const dependencies = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
    };

    if ([...changedPackages].some((packageName) => dependencies[packageName])) {
        console.log(app);
    }
}
