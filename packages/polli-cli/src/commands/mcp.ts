import { homedir } from "node:os";
import { Command } from "commander";
import { resolveHarnessKey } from "../harnesses/keys.js";
import type { HarnessContext } from "../harnesses/types.js";
import { BASE_URL } from "../lib/config.js";
import {
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";
import { fetchCatalog, filterServers } from "../mcp/catalog.js";
import { getClient, MCP_CLIENTS } from "../mcp/clients.js";

const ctx = (): HarnessContext => ({ home: homedir(), env: process.env });

async function resolveMcpKey(clientId: string): Promise<string> {
    // Reuse harness key logic: dedicated key per client, named polli-mcp-<client>
    return resolveHarnessKey(
        { id: `mcp-${clientId}`, label: `MCP ${clientId}`, existingKey: null },
        { browser: false },
    );
}

const list = new Command("list")
    .description("List available MCP servers from the live catalog")
    .action(async () => {
        const catalog = await fetchCatalog();
        if (getOutputMode() === "json") {
            printResult(catalog);
            return;
        }
        printTable(
            catalog.map((s) => ({
                id: s.id,
                name: s.name,
                url: s.url,
                description: s.description,
            })),
        );
        printInfo(`Catalog: ${BASE_URL}/mcp`);
    });

const add = new Command("add")
    .alias("install")
    .alias("on")
    .description("Install Pollinations MCP servers into a client")
    .argument(
        "[client]",
        "Client id (e.g. claude-code, cursor, vscode, codex, opencode, gemini). Use 'all' for every detected client",
    )
    .option(
        "--server <id>",
        "MCP server id to install (repeatable). Default: all",
        (v, prev: string[]) => (prev ? [...prev, v] : [v]),
        [],
    )
    .option("--all", "Install all catalog servers (default)")
    .option("--dry-run", "Show what would be written without writing")
    .action(async (clientArg, opts) => {
        const catalog = await fetchCatalog();
        const servers = filterServers(
            catalog,
            opts.server?.length ? opts.server : [],
        );
        const targets = resolveTargets(clientArg);
        if (targets.length === 0)
            fail(
                `Unknown client "${clientArg}". Available: ${MCP_CLIENTS.map((c) => c.id).join(", ")}, or "all"`,
            );
        for (const client of targets) {
            try {
                const key = await resolveMcpKey(client.id);
                if (opts.dryRun) {
                    printInfo(
                        `[dry-run] Would write ${servers.map((s) => s.id).join(", ")} to ${client.label} at ${client.configPath(ctx())} using key ${key.slice(0, 8)}…`,
                    );
                    continue;
                }
                client.write(ctx(), servers, key);
                printSuccess(
                    `${client.label}: installed ${servers.map((s) => s.id).join(", ")} → ${client.configPath(ctx())}`,
                );
                if (client.useEnvVar) {
                    printInfo(
                        `  ${client.label} stores the secret via env var. Key minted as polli-mcp-${client.id}. Export it or re-login if needed.`,
                    );
                }
                if (client.id === "codex")
                    printInfo(
                        `  Set ${"POLLI_MCP_CODEX_API_KEY"} in your shell or source ~/.pollinations/mcp-codex.env`,
                    );
                if (client.id === "vscode")
                    printInfo(
                        `  VS Code will prompt for the key via input "polli-mcp-key" on next MCP start.`,
                    );
            } catch (e) {
                fail(`Failed to install for ${client.label}`, e);
            }
        }
        printResult({
            installed: servers.map((s) => s.id),
            clients: targets.map((c) => c.id),
        });
    });

const remove = new Command("remove")
    .alias("off")
    .alias("uninstall")
    .description(
        "Remove Pollinations MCP servers from a client (only pollinations entries)",
    )
    .argument("[client]", "Client id or 'all'")
    .option(
        "--server <id>",
        "Only remove this server id (repeatable)",
        (v, prev: string[]) => (prev ? [...prev, v] : [v]),
        [],
    )
    .action(async (clientArg, opts) => {
        const targets = resolveTargets(clientArg);
        if (targets.length === 0) fail(`Unknown client "${clientArg}".`);
        for (const client of targets) {
            const changed = client.remove(
                ctx(),
                opts.server?.length ? opts.server : undefined,
            );
            if (changed)
                printSuccess(
                    `${client.label}: removed pollinations entries from ${client.configPath(ctx())}`,
                );
            else
                printInfo(
                    `${client.label}: no pollinations entries to remove at ${client.configPath(ctx())}`,
                );
        }
        printResult({ removed: true, clients: targets.map((c) => c.id) });
    });

const status = new Command("status")
    .description("Show which Pollinations MCP servers are installed per client")
    .argument("[client]", "Client id or 'all' (default: all)")
    .action(async (clientArg) => {
        const targets = clientArg ? resolveTargets(clientArg) : MCP_CLIENTS;
        const rows = targets.map((c) => {
            const s = c.status(ctx());
            return {
                client: c.id,
                label: c.label,
                installed: s.installed.join(", ") || "-",
                count: s.count,
                path: s.path,
            };
        });
        if (getOutputMode() === "json") {
            printResult(rows);
            return;
        }
        printTable(rows);
    });

function resolveTargets(arg?: string): typeof MCP_CLIENTS {
    if (!arg || arg === "all") return MCP_CLIENTS;
    const lower = arg.toLowerCase();
    if (lower === "all") return MCP_CLIENTS;
    const found = getClient(lower);
    if (found) return [found];
    // try partial match
    const matched = MCP_CLIENTS.filter(
        (c) => c.id.includes(lower) || c.label.toLowerCase().includes(lower),
    );
    if (matched.length > 0) return matched;
    return [];
}

export const mcpCommand = new Command("mcp")
    .description("Install Polli-hosted MCP servers into your coding clients")
    .addHelpText(
        "after",
        "\nCatalog: https://gen.pollinations.ai/mcp\nClients: claude-code, codex, vscode, cursor, opencode, gemini, windsurf, cline, amp, kiro, zed, warp, copilot-cli, claude-desktop\nExamples:\n  polli mcp list\n  polli mcp add cursor --server pollinations --server ffmpeg\n  polli mcp add vscode --all\n  polli mcp status\n  polli mcp remove cursor\n",
    )
    .addCommand(list)
    .addCommand(add)
    .addCommand(remove)
    .addCommand(status);

// alias top-level: polli mcp install <client> also works via add alias
