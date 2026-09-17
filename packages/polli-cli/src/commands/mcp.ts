import { homedir } from "node:os";
import { Command } from "commander";
import { resolveApiKey } from "../lib/config.js";
import { fail, printInfo, printResult, printSuccess } from "../lib/output.js";
import { fetchMcpCatalog, resolveServers } from "../mcp/catalog.js";
import type { McpClientAdapter, McpContext } from "../mcp/clients.js";
import { MCP_CLIENTS } from "../mcp/clients.js";
import { getStoredKey, removeStoredKey, storeKey } from "../mcp/keys.js";

const context = (): McpContext => ({ home: homedir(), env: process.env });

const runInstall = async (
    client: McpClientAdapter,
    options: {
        servers?: string[];
        key?: string;
        browser?: boolean;
        force?: boolean;
    },
) => {
    try {
        if (client.preflight) client.preflight(context());

        const catalog = await fetchMcpCatalog();
        const servers = resolveServers(catalog, options.servers);

        if (servers.length === 0) {
            fail("No matching servers found in the catalog");
        }

        const existing = getStoredKey(client.id);
        let key = existing;
        if (!key || options.force) {
            const accountKey = resolveApiKey(options.key);
            if (!accountKey) {
                fail(
                    'No API key available. Run "polli auth login" or pass --key.',
                );
            }
            key = await mintKey(client.id, client.label, accountKey!);
            storeKey(client.id, key);
        }

        const result = client.install(context(), servers, key);
        printSuccess(
            `${client.label}: installed ${result.installed.length} server(s).`,
        );
        for (const note of result.notes) printInfo(note);
        if (result.files.length > 0) {
            printInfo(`Modified: ${result.files.join(", ")}`);
        }
        printResult(result);
    } catch (error) {
        fail(`Failed to install MCP servers for ${client.label}`, error);
    }
};

const runRemove = async (
    client: McpClientAdapter,
    options: { servers?: string[] },
) => {
    try {
        if (client.preflight) client.preflight(context());
        const result = client.remove(context(), options.servers);
        if (result.removed?.length) {
            printSuccess(
                `${client.label}: removed ${result.removed.length} server(s).`,
            );
        } else {
            printInfo(`${client.label}: no owned servers to remove.`);
        }
        removeStoredKey(client.id);
        printResult(result);
    } catch (error) {
        fail(`Failed to remove MCP servers for ${client.label}`, error);
    }
};

const runStatus = (client: McpClientAdapter) => {
    try {
        const result = client.status(context());
        printResult({ client: client.id, installed: result.installed });
    } catch (error) {
        fail(`Failed to check status for ${client.label}`, error);
    }
};

const mintKey = async (
    clientId: string,
    label: string,
    accountKey: string,
): Promise<string> => {
    const { gen } = await import("../lib/api.js");
    const name = `polli-mcp-${clientId}`;
    const created = await gen<{ key: string }>("/account/keys", {
        method: "POST",
        apiKey: accountKey,
        body: { name, type: "secret" },
    });
    printSuccess(`Created API key "${name}" for ${label}.`);
    return created.key;
};

const withInstallOptions = (command: Command) =>
    command
        .option(
            "--servers <ids...>",
            "Specific servers to install (default: all catalog servers)",
        )
        .option("--key <key>", "Account API key (or use polli auth login)")
        .option("--force", "Mint a new dedicated key even if one exists");

const clientSubcommand = (client: McpClientAdapter) => {
    const command = withInstallOptions(
        new Command(client.id).description(client.description),
    ).action((options) => runInstall(client, options));

    command.addCommand(
        new Command("on")
            .description(`Install Pollinations MCP servers for ${client.label}`)
            .action(() => runInstall(client, command.opts())),
    );
    command.addCommand(
        new Command("off")
            .description(`Remove Pollinations MCP servers from ${client.label}`)
            .option("--servers <ids...>", "Specific servers to remove")
            .action((options) => runRemove(client, options)),
    );
    command.addCommand(
        new Command("status")
            .description(`Show Pollinations MCP servers in ${client.label}`)
            .action(() => runStatus(client)),
    );
    return command;
};

export const mcpCommand = new Command("mcp")
    .description("Install Pollinations MCP servers into coding agents")
    .addHelpText(
        "after",
        "\nServers are fetched live from https://gen.pollinations.ai/mcp\n",
    );

for (const client of MCP_CLIENTS) {
    mcpCommand.addCommand(clientSubcommand(client));
}
