import { homedir } from "node:os";
import { Command } from "commander";
import { offMcp, installMcp, statusMcp, mcpClientIds } from "../mcp/index.js";
import { fail, printResult, printInfo, printSuccess } from "../lib/output.js";

const CLIENTS_HINT = `(${mcpClientIds.join(", ")})`;

const context = () => ({ home: homedir(), env: process.env });

const SERVERS_ARG = "[servers...]";
const SERVERS_HELP =
    "Server ids from the live catalog (GET /mcp). Default: all servers.";

export const mcpCommand = () => {
    const mcp = new Command("mcp")
        .description(
            "Manage Pollinations MCP servers in coding agents (install/status/remove)",
        )
        .addHelpText(
            "after",
            `\nClients: ${mcpClientIds.join(", ")}\nServers come from the live catalog: GET ${"https://gen.pollinations.ai/mcp"}`,
        );

    mcp
        .command("install")
        .description(`Install one, several, or all catalog servers into a client ${CLIENTS_HINT}`)
        .argument("<client>", "target client")
        .argument(SERVERS_HELP && "[servers...]", SERVERS_HELP)
        .option(
            "--no-browser",
            "Print the login URL instead of opening a browser",
        )
        .action(
            async (
                client: string,
                servers: string[],
                options: { browser?: boolean },
            ) => {
                try {
                    const result = await installMcp(
                        { home: homedir(), env: process.env },
                        client,
                        servers && servers.length > 0 ? servers : undefined,
                        options,
                    );
                    printSuccess(
                        `${result.label}: ${result.installed.length} server(s) installed.`,
                    );
                    for (const hint of result.hints ?? []) printInfo(hint);
                    printInfo(result.restartHint);
                    printResult({
                        client: result.client,
                        installed: result.installed.map(
                            (entry) => `${entry.name} (${entry.serverId})`,
                        ),
                        files: result.files,
                    });
                } catch (error) {
                    fail(`Failed to install into ${client}`, error);
                }
            },
        );

    mcp.command("status")
        .description("Show which Pollinations MCP servers are installed per client")
        .argument("[client]", `restrict to one client ${CLIENTS_HINT}`)
        .action((client?: string) => {
            try {
                const ids = client ? [client] : mcpClientIds;
                printResult(
                    ids.map((id) => {
                        const result = statusMcp(
                            { home: homedir(), env: process.env },
                            id,
                        );
                        return {
                            client: result.client,
                            installed: result.installed,
                        };
                    }),
                );
            } catch (error) {
                fail("Failed to inspect MCP status", error);
            }
        });

    mcp.command("off")
        .description(
            `Remove Pollinations-owned MCP entries from a client (restores the pre-install snapshot when possible) ${CLIENTS_HINT}`,
        )
        .argument("<client>", "target client")
        .argument("[servers...]", "server ids to remove (default: all installed)")
        .action(
            async (client: string, servers: string[] | undefined) => {
                try {
                    const result = await offMcp(
                        { home: homedir(), env: process.env },
                        client,
                        servers && servers.length > 0 ? servers : undefined,
                    );
                    const outcome = result.outcome ?? "unchanged";
                    printSuccess(
                        outcome === "restored"
                            ? `${result.label}: original config restored.`
                            : outcome === "stripped"
                              ? `${result.label}: Pollinations entries removed.`
                              : `${result.label}: nothing to remove.`,
                    );
                    for (const hint of result.hints ?? []) printInfo(hint);
                } catch (error) {
                    fail(`Failed to remove MCP servers from ${client}`, error);
                }
            },
        );

    return mcp;
};
