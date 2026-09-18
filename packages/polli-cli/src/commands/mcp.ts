import { homedir } from "node:os";
import { Command } from "commander";
import {
    fail,
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";
import { fetchMcpCatalog } from "../mcp-clients/catalog.js";
import { CODEX_KEY_ENV } from "../mcp-clients/codex.js";
import {
    findMcpClientAdapter,
    mcpClientAdapters,
} from "../mcp-clients/index.js";
import { deleteMcpClientKey, resolveMcpClientKey } from "../mcp-clients/key.js";
import type {
    McpCatalogServer,
    McpClientAdapter,
    McpClientResult,
    McpContext,
} from "../mcp-clients/types.js";

const context = (): McpContext => ({ home: homedir(), env: process.env });

const supportedList = () =>
    mcpClientAdapters.map((adapter) => adapter.id).join(", ");

const pickAdapters = (
    names: string[] | undefined,
    options: { all?: boolean },
): McpClientAdapter[] => {
    if (names?.length) {
        const chosen: McpClientAdapter[] = [];
        for (const name of names) {
            const adapter = findMcpClientAdapter(name);
            if (adapter) {
                chosen.push(adapter);
            } else {
                fail(`Unknown client "${name}". Supported: ${supportedList()}`);
            }
        }
        return chosen;
    }
    const ctx = context();
    if (options.all) return mcpClientAdapters;
    return mcpClientAdapters.filter((adapter) => adapter.detect(ctx));
};

const selectServers = (
    catalog: McpCatalogServer[],
    filter: string[] | undefined,
): McpCatalogServer[] => {
    if (!filter?.length) return catalog;
    const unknown = filter.filter((id) => !catalog.some((s) => s.id === id));
    if (unknown.length) {
        fail(
            `Unknown server(s): ${unknown.join(", ")}. Catalog: ${catalog
                .map((s) => s.id)
                .join(", ")}`,
        );
    }
    return catalog.filter((server) => filter.includes(server.id));
};

/** Client-specific follow-ups the user has to do once. */
const installNotes = (adapter: McpClientAdapter, key: string) => {
    if (adapter.id === "codex") {
        printInfo(
            `Codex reads the token from an env var — add to your shell profile:\n  export ${CODEX_KEY_ENV}="${key}"`,
        );
    }
    if (adapter.id === "vscode") {
        printInfo(
            `VS Code prompts for the key when the server first connects — paste:\n  ${key}`,
        );
    }
    if (adapter.id === "claude-desktop") {
        printInfo(
            "Claude Desktop bridges via npx mcp-remote (downloaded on first use).",
        );
    }
};

const runInstall = async (
    names: string[] | undefined,
    options: { all?: boolean; browser?: boolean; servers?: string[] },
) => {
    const catalog = await fetchMcpCatalog().catch((error) =>
        fail("Failed to fetch the MCP catalog", error),
    );
    if (!catalog.length) fail("The MCP catalog at /mcp is empty.");
    const servers = selectServers(catalog, options.servers);
    const targets = pickAdapters(names, options);
    if (!targets.length) {
        printInfo(
            `No supported clients detected on this machine. Use --all to configure every client anyway, or pick one of: ${supportedList()}`,
        );
        return;
    }
    const ctx = context();
    const installed: McpClientResult[] = [];
    for (const adapter of targets) {
        try {
            const key = await resolveMcpClientKey(adapter.id, adapter.label, {
                browser: options.browser,
            });
            const result = await adapter.install(ctx, servers, key);
            installed.push(result);
            printSuccess(
                `${adapter.label}: configured ${result.servers.length} MCP server(s)`,
            );
            installNotes(adapter, key);
        } catch (error) {
            printError(
                `${adapter.label}: ${error instanceof Error ? error.message : error}`,
            );
        }
    }
    if (getOutputMode() === "json") printResult({ installed });
};

const runRemove = async (names: string[] | undefined) => {
    const targets = names?.length ? pickAdapters(names, {}) : mcpClientAdapters;
    const ctx = context();
    const removed: McpClientResult[] = [];
    for (const adapter of targets) {
        try {
            const result = await adapter.remove(ctx);
            if (result.servers.length) {
                await deleteMcpClientKey(adapter.id);
                printSuccess(
                    `${adapter.label}: removed ${result.servers.join(", ")}`,
                );
            }
            removed.push(result);
        } catch (error) {
            printError(
                `${adapter.label}: ${error instanceof Error ? error.message : error}`,
            );
        }
    }
    if (getOutputMode() === "json") printResult({ removed });
};

const runStatus = async () => {
    const ctx = context();
    const statuses: McpClientResult[] = [];
    for (const adapter of mcpClientAdapters) {
        statuses.push(await adapter.status(ctx));
    }
    if (getOutputMode() === "json") {
        printResult(statuses);
        return;
    }
    printInfo("Pollinations MCP servers per client:");
    printTable(
        statuses.map((status) => ({
            client: status.client,
            label: status.label,
            servers: status.servers.length ? status.servers.join(", ") : "-",
            config: status.files[0] ?? "-",
        })),
        ["client", "label", "servers", "config"],
    );
};

export const mcpCommand = new Command("mcp")
    .description(
        "Install Pollinations MCP servers (live catalog) into coding agents",
    )
    .addCommand(
        new Command("install")
            .description(
                "Configure catalog MCP servers in supported clients (default: detected ones)",
            )
            .argument("[clients...]", "client ids, e.g. claude-code codex")
            .option(
                "--all",
                "configure every supported client, detected or not",
            )
            .option("--browser", "open the browser for device-flow login")
            .option(
                "--servers <ids>",
                "comma-separated catalog server ids to install (default: all)",
                (value: string) => value.split(",").map((id) => id.trim()),
            )
            .action(runInstall),
    )
    .addCommand(
        new Command("remove")
            .description(
                "Strip Pollinations-owned entries from client configs and delete their keys",
            )
            .argument("[clients...]", "client ids (default: every client)")
            .action(runRemove),
    )
    .addCommand(
        new Command("status")
            .description("Show which clients carry Pollinations MCP servers")
            .action(runStatus),
    );
