#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const TARGETS = new Set(["pages", "worker", "script", "vps"]);
const CREDENTIALS = new Set([
    "apps",
    "myceli",
    "observability",
    "polli",
    "none",
]);

function readManifest(appPath, repoRoot = REPO_ROOT) {
    const filePath = path.join(repoRoot, appPath, "deploy.json");
    const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!TARGETS.has(manifest.target)) {
        throw new Error(`${appPath}/deploy.json has an invalid target`);
    }
    if (manifest.watch !== undefined && !Array.isArray(manifest.watch)) {
        throw new Error(`${appPath}/deploy.json watch must be an array`);
    }
    if (
        manifest.credentials !== undefined &&
        !CREDENTIALS.has(manifest.credentials)
    ) {
        throw new Error(`${appPath}/deploy.json has invalid credentials`);
    }
    if (manifest.verify !== undefined && !Array.isArray(manifest.verify)) {
        throw new Error(`${appPath}/deploy.json verify must be an array`);
    }
    return {
        name: path.basename(appPath),
        path: appPath,
        target: manifest.target,
        credentials: manifest.credentials || "none",
        sops: manifest.sops || "none",
        docker: manifest.docker === true,
        watch: manifest.watch || [],
    };
}

function discover(scope, repoRoot = REPO_ROOT) {
    if (scope === "all") {
        return [
            ...discover("apps", repoRoot),
            ...discover("operations", repoRoot),
        ].sort((a, b) => a.path.localeCompare(b.path));
    }
    if (scope !== "apps" && scope !== "operations") {
        throw new Error("scope must be apps, operations, or all");
    }
    return fs
        .readdirSync(path.join(repoRoot, scope), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${scope}/${entry.name}`)
        .filter((appPath) =>
            fs.existsSync(path.join(repoRoot, appPath, "deploy.json")),
        )
        .map((appPath) => readManifest(appPath, repoRoot))
        .sort((a, b) => a.path.localeCompare(b.path));
}

function selectChanged(apps, changedFiles) {
    return apps.filter((app) => {
        const prefixes = [`${app.path}/`, ...app.watch];
        return changedFiles.some((file) =>
            prefixes.some(
                (prefix) => file === prefix || file.startsWith(prefix),
            ),
        );
    });
}

function main() {
    const args = process.argv.slice(2);
    const value = (name) =>
        args
            .find((arg) => arg.startsWith(`${name}=`))
            ?.split("=")
            .slice(1)
            .join("=");
    const scope = value("--scope");
    const selected = value("--app");
    const changedFile = value("--changed");
    let apps = discover(scope);

    if (selected) {
        apps = apps.filter(
            (app) => app.path === selected || app.name === selected,
        );
        if (apps.length !== 1) throw new Error(`Unknown app: ${selected}`);
    } else if (changedFile) {
        const changedFiles = fs
            .readFileSync(changedFile, "utf8")
            .split(/\r?\n/)
            .filter(Boolean);
        apps = selectChanged(apps, changedFiles);
    }

    process.stdout.write(`${JSON.stringify(apps)}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { discover, readManifest, selectChanged };
