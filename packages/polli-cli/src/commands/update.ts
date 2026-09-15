import { execSync, spawn } from "node:child_process";
import { Command } from "commander";
import { fail, printInfo, printResult, printSuccess } from "../lib/output.js";

export type InstallKind = "npm-global" | "npx" | "local" | "unknown";

/**
 * Classify how the running CLI was installed, based on the path of the
 * executed script and npm's global prefix. Pure function so it stays testable.
 */
export const detectInstall = (
    scriptPath: string,
    globalPrefix?: string,
): InstallKind => {
    const p = scriptPath.replace(/\\/g, "/");
    if (p.includes("/_npx/")) return "npx";
    if (globalPrefix) {
        const g = globalPrefix.replace(/\\/g, "/").replace(/\/$/, "");
        if (g && p.startsWith(`${g}/`)) return "npm-global";
    }
    if (p.includes("/node_modules/")) return "local";
    return "unknown";
};

const npmGlobalPrefix = (): string | undefined => {
    try {
        return execSync("npm prefix -g", {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return undefined;
    }
};

export const updateCommand = new Command("update")
    .description("Update the Pollinations CLI to the latest version")
    .action(async () => {
        const kind = detectInstall(process.argv[1] ?? "", npmGlobalPrefix());

        if (kind === "npx") {
            printResult({
                install: kind,
                updated: false,
                hint: "npx runs resolve the latest version on demand. Run: npx @pollinations/cli@latest <command>",
            });
            return;
        }

        if (kind === "local") {
            printResult({
                install: kind,
                updated: false,
                hint: "Project-local install. Run `npm update @pollinations/cli` (or pnpm/yarn equivalent) in that project.",
            });
            return;
        }

        if (kind === "unknown") {
            printResult({
                install: kind,
                updated: false,
                hint: "Could not detect the install method. If installed globally: npm update -g @pollinations/cli. If run via npx: npx @pollinations/cli@latest <command>.",
            });
            return;
        }

        printInfo("Updating @pollinations/cli...");

        const child = spawn("npm", ["update", "-g", "@pollinations/cli"], {
            stdio: "inherit",
            shell: true,
        });

        child.on("error", (err) => {
            fail("Failed to run npm update", err);
        });

        child.on("close", (code) => {
            if (code === 0) {
                printSuccess("Pollinations CLI updated successfully.");
            } else {
                fail(`npm update exited with code ${code ?? "unknown"}`);
            }
        });
    });
