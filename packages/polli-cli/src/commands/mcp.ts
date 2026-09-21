import { homedir } from "node:os";
import { Command } from "commander";
import { resolveHarnessKey } from "../harnesses/keys.js";
import { fail, printInfo, printResult, printSuccess } from "../lib/output.js";
import { fetchMcpCatalog, resolveServers } from "../mcp/catalog.js";
import {
    findClient,
    MCP_CLIENTS,
    type McpClientAdapter,
    type McpContext,
} from "../mcp/clients.js";

const context = (): McpContext => ({ home: homedir(), env: process.env });

const CLIENT_IDS = MCP_CLIENTS.map((client) => client.id).join(", ");

const requireClient = (id: string): McpClientAdapter => {
    const client = findClient(id);
    if (!client) {
        fail(`Unknown client "${id}". Supported clients: ${CLIENT_IDS}`);
    }
    return client as McpClientAdapter;
};

const runList = async () => {
    try {
        const servers = await fetchMcpCatalog();
        printResult(
            servers.map((server) => ({
                id: server.id,
                name: server.name,
                url: server.url,
                description: server.description ?? "",
            })),
        );
    } catch (error) {
        fail("Failed to fetch the MCP server catalog", error);
    }
};

const runInstall = async (
    client: McpClientAdapter,
    servers: string[],
    options: { all?: boolean; browser?: boolean },
) => {
    try {
        const catalog = await fetchMcpCatalog();
        const selected = options.all
            ? catalog
            : resolveServers(catalog, servers);
        if (!options.all && servers.length === 0) {
            fail(
                `Pick servers from the catalog (polli mcp list) or pass --all: polli mcp install ${client.id} --all`,
            );
        }
        client.preflight?.(context());
        // Reinstalls reuse the key already written into the client's config
        // instead of minting another orphan: /account/keys accepts duplicate
        // names, so always minting leaks dead secret keys onto the account.
        const key = await resolveHarnessKey(
            {
                id: `mcp-${client.id}`,
                label: client.label,
                existingKey: client.existingKey?.(context()) ?? null,
            },
            { browser: options.browser },
        );
        const result = await client.install(context(), selected, key);
        printSuccess(
            `${client.label}: configured ${selected
                .map((server) => server.id)
                .join(", ")}.`,
        );
        for (const note of result.notes) printInfo(note);
        printResult(result);
    } catch (error) {
        fail(`Failed to install MCP servers into ${client.label}`, error);
    }
};

const runRemove = async (client: McpClientAdapter, servers: string[]) => {
    try {
        const result = await client.remove(
            context(),
            servers.length ? servers : undefined,
        );
        const removed = result.removed ?? [];
        if (removed.length === 0) {
            printInfo(
                `${client.label}: no Pollinations-owned MCP entries found; nothing changed.`,
            );
        } else {
            printSuccess(
                `${client.label}: removed ${removed.join(", ")}. Other MCP entries were left untouched.`,
            );
        }
        printResult(result);
    } catch (error) {
        fail(`Failed to remove MCP servers from ${client.label}`, error);
    }
};

const runStatus = async (clientId?: string) => {
    try {
        const clients = clientId ? [requireClient(clientId)] : MCP_CLIENTS;
        printResult(
            clients.map((client) => ({
                client: client.id,
                label: client.label,
                installed: client.status(context()).installed.join(", "),
            })),
        );
    } catch (error) {
        fail("Failed to inspect MCP client status", error);
    }
};

export const mcpCommand = new Command("mcp")
    .description("Install Pollinations MCP servers into coding agents and IDEs")
    .addHelpText(
        "after",
        `\nSupported clients: ${CLIENT_IDS}\nGuide: https://gen.pollinations.ai/docs#tag/mcp\n`,
    );

mcpCommand.addCommand(
    new Command("list")
        .description("List the live MCP server catalog")
        .action(runList),
);

mcpCommand.addCommand(
    new Command("install")
        .description(
            "Install Pollinations MCP servers into a client (dedicated API key per client)",
        )
        .argument("<client>", `one of: ${CLIENT_IDS}`)
        .argument("[servers...]", "server ids from `polli mcp list`")
        .option("--all", "Install every server from the catalog")
        .option(
            "--no-browser",
            "Print the login URL instead of opening a browser",
        )
        .action((client: string, servers: string[], options) =>
            runInstall(requireClient(client), servers, options),
        ),
);

mcpCommand.addCommand(
    new Command("remove")
        .alias("off")
        .description(
            "Remove Pollinations-owned MCP entries from a client (other entries are kept)",
        )
        .argument("<client>", `one of: ${CLIENT_IDS}`)
        .argument(
            "[servers...]",
            "server ids to remove; defaults to all Pollinations entries",
        )
        .action((client: string, servers: string[]) =>
            runRemove(requireClient(client), servers),
        ),
);

mcpCommand.addCommand(
    new Command("status")
        .description("Show which Pollinations MCP servers a client has")
        .argument("[client]", `one of: ${CLIENT_IDS}`)
        .action((client?: string) => runStatus(client)),
);
