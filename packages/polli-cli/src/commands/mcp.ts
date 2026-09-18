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
import {
    DEFAULT_MCP_SERVER,
    fetchCatalog,
    type McpCatalogEntry,
} from "../mcp/catalog.js";
import {
    ALL_CLIENTS,
    type CliAdapter,
    type InstallContext,
    installForClient,
    type JsonAdapter,
    type McpServerRef,
    removeForClient,
    statusForClient,
} from "../mcp/clients.js";
import { ensureMcpKey } from "../mcp/keys.js";

/** Resolve the target server from the live catalog. */
const resolveServer = async (
    serverId: string,
): Promise<{ entry: McpCatalogEntry; server: McpServerRef }> => {
    const catalog = await fetchCatalog();
    const entry = catalog.find((e) => e.id === serverId);
    if (!entry) {
        fail(
            `Unknown MCP server "${serverId}".`,
            `Available: ${catalog.map((e) => e.id).join(", ")}`,
        );
    }
    return {
        entry,
        server: { id: entry.id, url: entry.url, name: entry.name },
    };
};

/** Pick clients: explicit --client ids, --all, or auto-detected only. */
const selectClients = (opts: {
    client?: string;
    all?: boolean;
}): Array<JsonAdapter | CliAdapter> => {
    if (opts.client) {
        const ids = opts.client
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const unknown = ids.filter(
            (id) => !ALL_CLIENTS.some((a) => a.id === id),
        );
        if (unknown.length > 0) {
            fail(
                `Unknown client(s): ${unknown.join(", ")}.`,
                `Valid: ${ALL_CLIENTS.map((a) => a.id).join(", ")}`,
            );
        }
        return ALL_CLIENTS.filter((a) => ids.includes(a.id));
    }
    if (opts.all) return ALL_CLIENTS;
    const detected = ALL_CLIENTS.filter((a) => a.detect());
    if (detected.length === 0) {
        fail(
            "No MCP client detected on this machine.",
            `Pass --client <id> or --all. Valid: ${ALL_CLIENTS.map((a) => a.id).join(", ")}`,
        );
    }
    return detected;
};

export const mcpCommand = (): Command => {
    const cmd = new Command("mcp").description(
        "Connect Pollinations MCP tools to your coding agents",
    );

    cmd.command("list")
        .description("List available MCP servers on gen.pollinations.ai")
        .action(async () => {
            const catalog = await fetchCatalog();
            printTable(
                catalog.map((e) => ({
                    id: e.id,
                    name: e.name,
                    description: e.description ?? "",
                    url: e.url,
                })),
                ["id", "name", "description", "url"],
            );
        });

    cmd.command("install")
        .description(
            "Install a Pollinations MCP server into detected coding agents",
        )
        .argument("[server]", `MCP server id (default: ${DEFAULT_MCP_SERVER})`)
        .option(
            "--client <ids>",
            "comma-separated client ids (see --help); default: every detected client",
        )
        .option(
            "--all",
            "install into every supported client, not just detected",
        )
        .option("--key <key>", "use this API key instead of minting per-client")
        .action(async (server: string | undefined, opts) => {
            const serverId = server ?? DEFAULT_MCP_SERVER;
            const { entry, server: ref } = await resolveServer(serverId);
            const clients = selectClients(opts);
            const ctxs: Array<{
                client: JsonAdapter | CliAdapter;
                ctx: InstallContext;
            }> = [];
            for (const client of clients) {
                const apiKey =
                    opts.key ?? (await ensureMcpKey(client.id, client.label));
                ctxs.push({ client, ctx: { server: ref, apiKey } });
            }
            const results = [];
            for (const { client, ctx } of ctxs) {
                try {
                    results.push(await installForClient(client, ctx));
                } catch (error) {
                    results.push({
                        client: client.label,
                        status: "error" as const,
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
            const installed = results.filter((r) => r.status === "installed");
            if (getOutputMode() === "json") {
                printResult({ server: entry.id, results });
                return;
            }
            printSuccess(
                `Pollinations MCP "${entry.id}" installed into ${installed.length}/${results.length} client(s).`,
            );
            for (const r of results.filter((r) => r.status === "error")) {
                printError(`${r.client}: ${r.detail}`);
            }
            printInfo(
                "Restart the client(s) to pick up the new server. Keys can be revoked with `polli keys`.",
            );
        });

    cmd.command("status")
        .description("Show which coding agents have the server installed")
        .argument("[server]", `MCP server id (default: ${DEFAULT_MCP_SERVER})`)
        .action(async (server: string | undefined) => {
            const serverId = server ?? DEFAULT_MCP_SERVER;
            const { server: ref } = await resolveServer(serverId);
            printTable(
                ALL_CLIENTS.map((a) => statusForClient(a, ref)),
                ["client", "detected", "installed", "config"],
            );
        });

    cmd.command("remove")
        .description(
            "Remove the server from coding agents (minted keys are kept)",
        )
        .argument("[server]", `MCP server id (default: ${DEFAULT_MCP_SERVER})`)
        .option(
            "--client <ids>",
            "comma-separated client ids; default: detected",
        )
        .option("--all", "remove from every supported client")
        .action(async (server: string | undefined, opts) => {
            const serverId = server ?? DEFAULT_MCP_SERVER;
            const { server: ref } = await resolveServer(serverId);
            const clients = selectClients(opts);
            const results = [];
            for (const client of clients) {
                try {
                    results.push(await removeForClient(client, ref));
                } catch (error) {
                    results.push({
                        client: client.label,
                        status: "error" as const,
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
            if (getOutputMode() === "json") {
                printResult({ server: ref.id, results });
                return;
            }
            const removed = results.filter((r) => r.status === "removed");
            printSuccess(
                removed.length > 0
                    ? `Removed from ${removed.length} client(s). Minted keys were kept — revoke with \`polli keys\` if desired.`
                    : "Nothing to remove.",
            );
            for (const r of results.filter((r) => r.status === "error")) {
                printError(`${r.client}: ${r.detail}`);
            }
        });

    return cmd;
};
