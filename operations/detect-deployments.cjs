#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_PATH = path.join(__dirname, "deployments.json");
const CONTROL_PATHS = new Set([
    ".github/workflows/deploy-operations-cloudflare.yml",
    "operations/deployments.json",
    "operations/detect-deployments.cjs",
]);

function detectDeployments(changedFiles, manifest) {
    const names = Object.keys(manifest).sort();
    if (changedFiles.some((file) => CONTROL_PATHS.has(file))) return names;

    return names.filter((name) =>
        manifest[name].paths.some((prefix) =>
            changedFiles.some(
                (file) => file === prefix || file.startsWith(prefix),
            ),
        ),
    );
}

if (require.main === module) {
    const changedFile = process.argv[2];
    if (!changedFile) {
        console.error("Usage: detect-deployments.cjs <changed-files.txt>");
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const changedFiles = fs
        .readFileSync(changedFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean);
    process.stdout.write(detectDeployments(changedFiles, manifest).join(" "));
}

module.exports = { detectDeployments };
