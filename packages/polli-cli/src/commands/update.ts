import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { printError, printInfo, printSuccess } from "../lib/output.js";

const PKG = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
) as { version: string; name: string };

type InstallKind = "global" | "npx" | "local";

function detectInstallKind(): InstallKind {
    const execDir = process.execPath.toLowerCase();
    const runDir = process.argv[1]?.toLowerCase() ?? "";

    if (execDir.includes("_npx") || runDir.includes("_npx")) return "npx";

    try {
        const npmRoot = execSync("npm root -g", {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();

        if (runDir.startsWith(npmRoot.toLowerCase())) return "global";
    } catch {
        // npm not available — fall through
    }

    return "local";
}

function getLatestVersion(name: string): string | null {
    try {
        return execSync(`npm view ${name} version`, {
            encoding: "utf-8",
            timeout: 15000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    } catch {
        return null;
    }
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

export const updateCommand = new Command("update")
    .description("Check for and install the latest version of polli")
    .option("--check", "Only check for updates, don't install")
    .action(async (opts) => {
        const current = PKG.version;
        const kind = detectInstallKind();

        printInfo(`Current version: v${current}`);
        printInfo(`Install method: ${kind}`);

        const latest = getLatestVersion(PKG.name);
        if (!latest) {
            printError("Could not reach npm registry — are you offline?");
            process.exit(1);
        }

        if (compareVersions(latest, current) <= 0) {
            printSuccess(`Already up to date (v${current})`);
            return;
        }

        printInfo(`New version available: v${latest}`);

        if (opts.check) {
            printInfo("Run `polli update` to install");
            return;
        }

        if (kind === "npx") {
            printInfo(
                "You're running via npx — the next `npx @pollinations/cli` invocation will use the latest version automatically.",
            );
            return;
        }

        if (kind === "local") {
            printInfo(
                "Local install detected — update with: npm update @pollinations/cli",
            );
            return;
        }

        // Global install — update in place
        printInfo("Installing latest version...");
        try {
            execSync(`npm install -g ${PKG.name}@${latest}`, {
                stdio: "inherit",
                timeout: 60000,
            });
            printSuccess(`Updated to v${latest}`);
        } catch {
            printError(
                "Update failed — try running: npm install -g @pollinations/cli@latest",
            );
            process.exit(1);
        }
    });
