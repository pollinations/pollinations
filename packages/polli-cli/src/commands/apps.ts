import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

interface UserApp {
    id: string;
    slug: string;
    url: string;
    createdAt: string;
    updatedAt: string;
    // printResult expects Record<string, unknown>; the API may add fields.
    [key: string]: unknown;
}

// Recursively collect file paths under a directory. Dotfiles and node_modules
// are skipped so a raw project dir (not just a built dist/) still deploys
// sensibly; the caller normally points this at a build output folder.
// Symlinks are resolved via statSync (not the withFileTypes Dirent, which
// reports a symlink as neither file nor dir) so symlinked assets — common in
// pnpm/monorepo builds — are not silently dropped.
function walkFiles(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") {
                continue;
            }
            const full = join(dir, entry.name);
            let stat: ReturnType<typeof statSync>;
            try {
                stat = statSync(full);
            } catch {
                // Broken symlink or unreadable entry — skip it.
                continue;
            }
            if (stat.isDirectory()) walk(full);
            else if (stat.isFile()) out.push(full);
        }
    };
    walk(root);
    return out;
}

// Reads a directory into the { "path": base64 } map the deploy API expects.
// Keys are POSIX-relative to the directory root.
function readAppFiles(dir: string): Record<string, string> {
    let stat: ReturnType<typeof statSync>;
    try {
        stat = statSync(dir);
    } catch {
        printError(`Directory not found: ${dir}`);
        process.exit(1);
    }
    if (!stat.isDirectory()) {
        printError(`Not a directory: ${dir}`);
        process.exit(1);
    }
    const files: Record<string, string> = {};
    for (const abs of walkFiles(dir)) {
        const key = relative(dir, abs).split(sep).join("/");
        files[key] = readFileSync(abs).toString("base64");
    }
    if (Object.keys(files).length === 0) {
        printError(`No files found under: ${dir}`);
        process.exit(1);
    }
    return files;
}

function printApps(apps: UserApp[]): void {
    if (getOutputMode() === "json") {
        printResult(apps);
        return;
    }
    printTable(
        apps.map((app) => ({
            slug: chalk.hex("#a78bfa").bold(app.slug),
            url: chalk.underline(app.url),
            created: chalk.dim(app.createdAt.slice(0, 10)),
        })),
        ["slug", "url", "created"],
    );
}

const list = new Command("list")
    .alias("ls")
    .description("List your deployed apps")
    .action(async () => {
        const key = requireKey();
        try {
            const res = await gen<{ data: UserApp[] }>("/account/apps", {
                apiKey: key,
            });
            printApps(res.data);
        } catch (err) {
            printError(
                `Failed to list apps: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const deploy = new Command("deploy")
    .description("Deploy a directory of static files to <slug>.pollinations.ai")
    .argument("<dir>", "Directory of pre-built static files (e.g. ./dist)")
    .requiredOption("--slug <slug>", "Subdomain to serve the app at")
    .action(async (dir: string, opts: { slug: string }) => {
        const key = requireKey();
        const files = readAppFiles(dir);
        try {
            const app = await gen<UserApp>("/account/apps", {
                apiKey: key,
                method: "POST",
                body: { slug: opts.slug, files },
            });
            if (getOutputMode() === "json") printResult(app);
            else {
                printSuccess(
                    `Deployed ${Object.keys(files).length} files → ${app.url}`,
                );
                printApps([app]);
            }
        } catch (err) {
            printError(
                `Failed to deploy app: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const update = new Command("update")
    .description("Replace a deployed app's files (slug is unchanged)")
    .argument("<id>", "App id")
    .argument("<dir>", "Directory of pre-built static files")
    .action(async (id: string, dir: string) => {
        const key = requireKey();
        const files = readAppFiles(dir);
        try {
            const app = await gen<UserApp>(
                `/account/apps/${encodeURIComponent(id)}/update`,
                { apiKey: key, method: "POST", body: { files } },
            );
            if (getOutputMode() === "json") printResult(app);
            else {
                printSuccess(
                    `Updated ${Object.keys(files).length} files → ${app.url}`,
                );
                printApps([app]);
            }
        } catch (err) {
            printError(
                `Failed to update app: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const remove = new Command("delete")
    .alias("rm")
    .description("Delete a deployed app and release its subdomain")
    .argument("<id>", "App id")
    .action(async (id: string) => {
        const key = requireKey();
        try {
            const res = await gen<{ id: string }>(
                `/account/apps/${encodeURIComponent(id)}`,
                { apiKey: key, method: "DELETE" },
            );
            if (getOutputMode() === "json") printResult(res);
            else printSuccess(`Deleted app ${res.id}`);
        } catch (err) {
            printError(
                `Failed to delete app: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const appsCommand = new Command("apps")
    .description("Deploy and manage your hosted static apps")
    .addCommand(deploy)
    .addCommand(list)
    .addCommand(update)
    .addCommand(remove);
