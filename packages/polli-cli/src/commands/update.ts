import { execFileSync, spawnSync } from "node:child_process";
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
const NPX_SEGMENT = "_npx";

// Walk up from the module's own location to the package root: tsup bundles
// everything into one dist/index.js, so relative depths break once bundled.
function packageRoot(): string {
    let dir = resolve(dirname(fileURLToPath(import.meta.url)));
    while (dir !== dirname(dir) && !existsSync(join(dir, "package.json"))) {
        dir = dirname(dir);
    }
    return dir;
}

export function readVersion(dir: string): string {
    try {
        const pkg = JSON.parse(
            readFileSync(join(dir, "package.json"), "utf-8"),
        ) as { version?: string };
        return pkg.version ?? "unknown";
    } catch {
        return "unknown";
    }
}

function npmGlobalRoot(): string | null {
    try {
        return execFileSync("npm", ["root", "-g"], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

/** Classify how the running copy was installed, purely from its on-disk
 * location: npx caches under a `_npx` segment, global installs sit directly
 * under `npm root -g`; anything else (local dev, linked checkout, project
 * dependency) is treated as local and never touched. */
export function detectInstallKind(
    dir: string,
    globalRoot: string | null,
): "global" | "npx" | "local" {
    if (resolve(dir).split(sep).includes(NPX_SEGMENT)) return "npx";
    if (
        globalRoot &&
        resolve(dir) === resolve(globalRoot, "@pollinations", "cli")
    ) {
        return "global";
    }
    return "local";
}

const ADVICE: Record<"npx" | "local", string> = {
    npx: "Running via npx — every run already fetches the latest published version; nothing to update.",
    local: `Not a global npm install. Update the dependency where it is declared, or install globally with: npm install -g ${PACKAGE_NAME}`,
};

export const updateCommand = new Command("update")
    .description(
        `Update the globally installed ${PACKAGE_NAME} to the latest stable version`,
    )
    .action(() => {
        try {
            const kind = detectInstallKind(packageRoot(), npmGlobalRoot());
            if (kind !== "global") {
                printInfo(ADVICE[kind]);
                printResult({ installType: kind, updated: false });
                return;
            }

            const dir = resolve(packageRoot());
            const before = readVersion(dir);
            // Explicit network call, made only because the user asked to
            // update — never at startup. npm itself resolves `latest`.
            const latest = execFileSync("npm", ["view", PACKAGE_NAME, "version"], {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();

            if (latest === before) {
                printSuccess(`Already up to date (v${before}).`);
                printResult({ version: before, installType: kind, updated: false });
                return;
            }

            printInfo(`Updating ${PACKAGE_NAME} (v${before} → v${latest})...`);
            const install = spawnSync(
                "npm",
                ["install", "-g", `${PACKAGE_NAME}@${latest}`],
                {
                    encoding: "utf-8",
                    stdio: getOutputMode() === "json" ? "pipe" : "inherit",
                },
            );
            if (install.error || install.status !== 0) {
                fail(
                    "npm install failed — check write permissions on the npm prefix (do not use sudo)",
                    install.error ??
                        new Error(
                            install.stderr ||
                                `npm exited with code ${install.status}`,
                        ),
                );
            }

            const after = readVersion(dir);
            printSuccess(`Updated ${PACKAGE_NAME} to v${after}.`);
            printResult({
                previous: before,
                version: after,
                installType: kind,
                updated: true,
            });
        } catch (err) {
            fail("Failed to update", err);
        }
    });
