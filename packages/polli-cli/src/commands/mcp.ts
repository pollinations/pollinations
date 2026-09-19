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
import { getClient, installIntoClient, MCP_CLIENTS } from "../mcp/clients.js";

const ctx = (): HarnessContext => ({ home: homedir(), env: process.env });

const resolveTargets = (clientArg?: string) => {
    if (!clientArg || clientArg === "all") return [...MCP_CLIENTS];
    const one = getClient(clientArg);
    return one ? [one] : [];
};

async function resolveMcpKey(clientId: string): Promise<string> {
    return resolveHarnessKey(
        { id: `mcp-${clientId}`, label: `MCP ${clientId}`, existingKey: null },
        { browser: false },
    );
}

const list = new Command("list")
    .description("List MCP servers from the live Pollinations catalog")
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

const clientsCmd = new Command("clients")
    .description("List supported coding-agent clients")
    .action(() => {
        if (getOutputMode() === "json") {
            printResult(
                MCP_CLIENTS.map((c) => ({
                    id: c.id,
                    label: c.label,
                    docs: c.docsUrl,
                    useEnvVar: c.useEnvVar,
                    cli: c.cli ?? null,
                })),
            );
            return;
        }
        printTable(
            MCP_CLIENTS.map((c) => ({
                id: c.id,
                label: c.label,
                secret: c.useEnvVar ? "env-var" : "header",
                cli: c.cli ?? "file",
            })),
        );
    });

const add = new Command("add")
    .alias("install")
    .alias("on")
    .description("Install Pollinations MCP servers into a client")
    .argument(
        "<client>",
        "Client id (claude-code, codex, vscode, cursor, …) or 'all'",
    )
    .option(
        "--server <id>",
        "Server id to install (repeatable). Default: all catalog servers",
        (v: string, prev: string[]) => [...prev, v],
        [] as string[],
    )
    .option("--dry-run", "Show planned writes without changing files")
    .action(
        async (
            clientArg: string,
            opts: { server: string[]; dryRun?: boolean },
        ) => {
            const catalog = await fetchCatalog();
            const servers = filterServers(catalog, opts.server);
            const targets = resolveTargets(clientArg);
            if (targets.length === 0) {
                fail(
                    `Unknown client "${clientArg}". Available: ${MCP_CLIENTS.map((c) => c.id).join(", ")}, or "all"`,
                );
            }
            for (const client of targets) {
                try {
                    if (opts.dryRun) {
                        printInfo(
                            `[dry-run] ${client.label}: would install ${servers.map((s) => s.id).join(", ")} → ${client.configPath(ctx())}`,
                        );
                        continue;
                    }
                    const key = await resolveMcpKey(client.id);
                    const { via, path } = installIntoClient(
                        client,
                        ctx(),
                        servers,
                        key,
                    );
                    printSuccess(
                        `${client.label}: installed ${servers.map((s) => s.id).join(", ")} via ${via} → ${path}`,
                    );
                    if (client.id === "codex") {
                        printInfo(
                            `Export ${"POLLI_MCP_CODEX_API_KEY"} or source ~/.pollinations/mcp-codex.env`,
                        );
                    }
                    if (client.id === "vscode") {
                        printInfo(
                            `VS Code prompts for input "polli-mcp-key" on first MCP start.`,
                        );
                    }
                } catch (error) {
                    fail(`Failed to install for ${client.label}`, error);
                }
            }
            printResult({
                installed: servers.map((s) => s.id),
                clients: targets.map((c) => c.id),
            });
        },
    );

const remove = new Command("remove")
    .alias("off")
    .alias("uninstall")
    .description("Remove only Pollinations-owned MCP entries from a client")
    .argument("<client>", "Client id or 'all'")
    .option(
        "--server <id>",
        "Only remove this server id (repeatable)",
        (v: string, prev: string[]) => [...prev, v],
        [] as string[],
    )
    .action(async (clientArg: string, opts: { server: string[] }) => {
        const targets = resolveTargets(clientArg);
        if (targets.length === 0) {
            fail(`Unknown client "${clientArg}"`);
        }
        for (const client of targets) {
            const changed = client.remove(
                ctx(),
                opts.server.length ? opts.server : undefined,
            );
            if (changed) {
                printSuccess(
                    `${client.label}: removed Pollinations MCP entries from ${client.configPath(ctx())}`,
                );
            } else {
                printInfo(`${client.label}: nothing to remove`);
            }
        }
    });

const status = new Command("status")
    .description("Show installed Pollinations MCP servers per client")
    .argument("[client]", "Optional client id")
    .action((clientArg?: string) => {
        const targets = resolveTargets(clientArg ?? "all");
        if (clientArg && targets.length === 0)
            fail(`Unknown client "${clientArg}"`);
        const rows = targets.map((client) => {
            const st = client.status(ctx());
            return {
                client: client.id,
                installed: st.installed.join(", ") || "—",
                count: st.count,
                path: st.path,
            };
        });
        if (getOutputMode() === "json") {
            printResult(rows);
            return;
        }
        printTable(rows);
    });

export const mcpCommand = new Command("mcp")
    .description(
        "Install Pollinations MCP servers into coding agents (live catalog)",
    )
    .addCommand(list)
    .addCommand(clientsCmd)
    .addCommand(add)
    .addCommand(remove)
    .addCommand(status);
