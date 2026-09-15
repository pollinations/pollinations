import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printSuccess,
} from "../lib/output.js";

const PACKAGE_NAME = "@pollinations/cli";
const REGISTRY_URL = "https://registry.npmjs.org/@pollinations%2Fcli/latest";

// Walk up from this module's own location to find the package root. tsup
// bundles every source file into a single dist/index.js, so a hardcoded
// relative depth (correct for src/commands/update.ts) breaks once bundled.
function findPackageRoot(fromDir: string): string {
    let dir = resolve(fromDir);
    while (!existsSync(join(dir, "package.json"))) {
        const parent = dirname(dir);
        if (parent === dir) throw new Error("could not locate package.json");
        dir = parent;
    }
    return dir;
}

const packageDir = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
const currentVersion = (
    JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8")) as {
        version: string;
    }
).version;

export type InstallKind = "global" | "npx" | "local";

/** Classify how this running copy was installed, purely from its on-disk
 * location — npx caches under a `_npx` segment, global installs sit directly
 * under `npm root -g`. Anything else (local dev, linked, project dependency)
 * falls back to "local" so we never touch it. */
export function detectInstallKind(
    dir: string,
    globalRoot: string | null,
): InstallKind {
    const resolvedDir = resolve(dir);
    if (resolvedDir.split(sep).includes("_npx")) return "npx";
    if (
        globalRoot &&
        resolvedDir === resolve(globalRoot, "@pollinations", "cli")
    ) {
        return "global";
    }
    return "local";
}

function npmGlobalRoot(): string | null {
    try {
        return execSync("npm root -g", {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
        }).trim();
    } catch {
        return null;
    }
}

async function fetchLatestVersion(): Promise<string> {
    const res = await fetch(REGISTRY_URL, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = (await res.json()) as { version?: string };
    if (!data.version) throw new Error("registry response missing a version");
    return data.version;
}

const NON_GLOBAL_ADVICE: Record<Exclude<InstallKind, "global">, string> = {
    npx: `Run the latest version with: npx ${PACKAGE_NAME}@latest <command>`,
    local: `Not a global npm install. Update the dependency where it's declared, or install globally with: npm install -g ${PACKAGE_NAME}`,
};

export const updateCommand = new Command("update")
    .description(
        `Update the globally installed ${PACKAGE_NAME} to the latest version`,
    )
    .action(async () => {
        try {
            const kind = detectInstallKind(packageDir, npmGlobalRoot());

            if (kind !== "global") {
                const message = NON_GLOBAL_ADVICE[kind];
                printInfo(message);
                printResult({
                    current: currentVersion,
                    updated: false,
                    installType: kind,
                    message,
                });
                return;
            }

            const latest = await fetchLatestVersion();
            if (currentVersion === latest) {
                printSuccess(`Already up to date (v${currentVersion}).`);
                printResult({
                    current: currentVersion,
                    latest,
                    updated: false,
                    installType: kind,
                });
                return;
            }

            const isJson = getOutputMode() === "json";
            printInfo(
                `Updating ${PACKAGE_NAME} ${currentVersion} → ${latest}...`,
            );

            const install = spawnSync(
                "npm",
                ["install", "-g", `${PACKAGE_NAME}@latest`],
                {
                    stdio: isJson ? "pipe" : "inherit",
                    encoding: "utf-8",
                    shell: process.platform === "win32",
                },
            );

            if (install.error || install.status !== 0) {
                fail(
                    "npm install failed",
                    install.error ??
                        new Error(
                            install.stderr ||
                                `npm exited with code ${install.status}`,
                        ),
                );
            }

            const installed = JSON.parse(
                readFileSync(join(packageDir, "package.json"), "utf-8"),
            ).version as string;
            printSuccess(`Updated to v${installed}.`);
            printResult({
                current: currentVersion,
                latest: installed,
                updated: true,
                installType: kind,
            });
        } catch (err) {
            fail("Failed to update", err);
        }
    });
