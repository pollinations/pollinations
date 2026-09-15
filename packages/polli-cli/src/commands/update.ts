import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import { getOutputMode, printSuccess } from "../lib/output.js";
import {
    fetchLatestVersion,
    formatUpdateNotice,
    isNewerVersion,
    NPM_PACKAGE,
} from "../lib/update-check.js";

interface ResolvedPackageManager {
    cmd: string;
    args: string[];
}

/** Prefer the package manager the user actually installed with; npm as fallback. */
export const resolvePackageManager = (
    env: NodeJS.ProcessEnv = process.env,
): ResolvedPackageManager => {
    if (env.npm_config_user_agent?.startsWith("pnpm")) {
        return { cmd: "pnpm", args: ["add", "-g", `${NPM_PACKAGE}@latest`] };
    }
    if (env.npm_config_user_agent?.startsWith("yarn")) {
        return {
            cmd: "yarn",
            args: ["global", "add", `${NPM_PACKAGE}@latest`],
        };
    }
    if (env.npm_config_user_agent?.startsWith("bun")) {
        return { cmd: "bun", args: ["add", "-g", `${NPM_PACKAGE}@latest`] };
    }
    return { cmd: "npm", args: ["i", "-g", `${NPM_PACKAGE}@latest`] };
};

export const updateCommand = new Command("update")
    .description("Update the polli CLI to the latest version")
    .option(
        "--check",
        "Only show whether an update is available (no install)",
        false,
    )
    .action(async (opts: { check: boolean }) => {
        const current = process.env.npm_package_version ?? "0.0.0";
        const latest = await fetchLatestVersion();

        if (getOutputMode() === "json") {
            const updateAvailable =
                latest != null && isNewerVersion(latest, current);
            process.stdout.write(
                `${JSON.stringify(
                    {
                        current,
                        latest: latest ?? null,
                        updateAvailable,
                    },
                    null,
                    2,
                )}\n`,
            );
            if (opts.check || !updateAvailable) return;
        } else {
            if (!latest) {
                printSuccess(
                    "Could not reach the npm registry. Check your connection and try again.",
                );
                return;
            }
            if (!isNewerVersion(latest, current)) {
                printSuccess(`polli is up to date (${current}).`);
                return;
            }
            if (opts.check) {
                process.stdout.write(
                    `${formatUpdateNotice(current, latest)}\n`,
                );
                return;
            }
            process.stdout.write(
                `${chalk.bold(`Updating polli ${current} → ${latest}`)}\n`,
            );
        }

        const { cmd, args } = resolvePackageManager();
        const result = spawnSync(cmd, args, { stdio: "inherit" });

        if (result.error || result.status !== 0) {
            process.stderr.write(
                `Update failed. Install manually with: ${cmd} ${args.join(" ")}\n`,
            );
            process.exitCode = 1;
            return;
        }
        if (getOutputMode() !== "json") {
            printSuccess("Update complete. Run `polli --version` to confirm.");
        }
    });
