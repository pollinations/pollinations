import { homedir } from "node:os";
import { Command } from "commander";
import { HARNESSES } from "../harnesses/index.js";
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
import {
    fetchMcpCatalog,
    type McpServer,
    resolveServers,
} from "../mcp/catalog.js";
import { findClient, MCP_CLIENTS } from "../mcp/clients.js";
import {
    mcpKeyName,
    readCachedKey,
    removeCachedKey,
    writeCachedKey,
} from "../mcp/keys.js";
import type { McpClient, McpContext, McpStatus } from "../mcp/types.js";

const context = (): McpContext => ({ home: homedir(), env: process.env });
const harnessContext = (ctx: McpContext): HarnessContext => ({
    home: ctx.home,
    env: ctx.env,
});

const catalog = async (): Promise<McpServer[]> => {
    try {
        return await fetchMcpCatalog();
    } catch (error) {
        return fail("Failed to read the MCP catalog", error);
    }
};

const serverNames = (servers: McpServer[]) =>
    servers.map((server) => server.id).join(", ");

const statusOf = (client: McpClient, ctx: McpContext): McpStatus => {
    let servers: string[] = [];
    try {
        servers = client.installed(ctx);
    } catch {
        servers = [];
    }
    return {
        client: client.id,
        label: client.label,
        kind: "mcp",
        installed: servers.length > 0,
        servers,
        config: client.configPaths(ctx),
    };
};

/** Falls back to a harness only when no MCP client claims the id. */
const findHarness = (
    client: McpClient | null,
    id: string,
): (typeof HARNESSES)[number] | null =>
    client
        ? null
        : (HARNESSES.find(
              (candidate) => candidate.id === id.trim().toLowerCase(),
          ) ?? null);

/**
 * Harnesses own their own MCP wiring; report whether they register it. A
 * harness whose id is also an MCP client (OpenCode) is reported once, by the
 * client, because `polli mcp install` edits that config file.
 */
const harnessStatusOf = async (ctx: McpContext): Promise<McpStatus[]> => {
    const rows: McpStatus[] = [];
    for (const harness of HARNESSES.filter(
        (candidate) => !findClient(candidate.id),
    )) {
        try {
            const result = await harness.status(harnessContext(ctx));
            const installed = result.mcp === true;
            rows.push({
                client: harness.id,
                label: harness.label,
                kind: "harness",
                installed,
                servers: installed ? ["pollinations"] : [],
                config: result.files,
            });
        } catch {
            rows.push({
                client: harness.id,
                label: harness.label,
                kind: "harness",
                installed: false,
                servers: [],
                config: [],
            });
        }
    }
    return rows;
};

const runList = async () => {
    const servers = await catalog();
    const clients = [
        ...MCP_CLIENTS.map((client) => ({
            client: client.id,
            label: client.label,
            description: client.description,
        })),
        ...HARNESSES.filter((harness) => !findClient(harness.id)).map(
            (harness) => ({
                client: harness.id,
                label: harness.label,
                description: `${harness.description} (harness)`,
            }),
        ),
    ];

    if (getOutputMode() === "json") {
        printResult({ servers, clients });
        return;
    }

    printInfo(`Servers in the live catalog (${BASE_URL}/mcp):`);
    printTable(
        servers.map((server) => ({
            server: server.id,
            url: server.url,
            use: server.description ?? "",
        })),
        ["server", "url", "use"],
    );
    printInfo("Clients `polli mcp install` can register them in:");
    printTable(clients, ["client", "label", "description"]);
};

const runInstall = async (
    clientId: string,
    names: string[],
    options: { all?: boolean; browser?: boolean },
) => {
    const ctx = context();
    const client = findClient(clientId);
    const harness = findHarness(client, clientId);
    if (harness) {
        try {
            const result = await harness.on(harnessContext(ctx), {
                mcp: true,
                browser: options.browser,
            });
            printSuccess(`${harness.label} now uses Pollinations.`);
            printInfo(
                result.mcp
                    ? `${harness.label} registered the Pollinations MCP server (${BASE_URL}/mcp/pollinations).`
                    : `${harness.label} talks to the Pollinations API directly and does not register MCP servers; pick a client from \`polli mcp list\` for MCP tools.`,
            );
            printInfo(harness.restartHint);
            printResult(result);
        } catch (error) {
            fail(`Failed to connect ${harness.label}`, error);
        }
        return;
    }

    if (!client) {
        return fail(
            `Unknown client "${clientId}". Run polli mcp list to see the supported clients.`,
        );
    }

    const servers = await catalog();
    if (!options.all && names.length === 0) {
        fail(
            `Name at least one server, or pass --all. Available: ${serverNames(servers)}`,
        );
    }
    const requested = options.all ? servers.map((server) => server.id) : names;
    const { servers: selected, unknown } = resolveServers(servers, requested);
    if (unknown.length > 0) {
        fail(
            `Unknown server(s): ${unknown.join(", ")}. Available: ${serverNames(servers)}`,
        );
    }
    if (!client.available(ctx)) {
        fail(
            `${client.label} is not installed: no \`${client.bin}\` on PATH. Install ${client.label} first, then run this again.`,
        );
    }

    let key: string;
    try {
        key = await resolveHarnessKey(
            {
                id: `mcp-${client.id}`,
                keyName: mcpKeyName(client.id),
                label: client.label,
                existingKey:
                    client.existingKey(ctx) ?? readCachedKey(ctx, client.id),
            },
            { browser: options.browser },
        );
    } catch (error) {
        return fail(
            `Failed to get a Pollinations key for ${client.label}`,
            error,
        );
    }
    writeCachedKey(ctx, client.id, key);

    let report: ReturnType<McpClient["install"]>;
    try {
        report = client.install(ctx, selected, key);
    } catch (error) {
        return fail(`Failed to configure ${client.label}`, error);
    }

    printSuccess(
        `${client.label}: ${report.servers.length} Pollinations MCP server(s) registered.`,
    );
    printInfo(client.restartHint);
    for (const note of report.notes) printInfo(note);
    printResult({ ...report, key: mcpKeyName(client.id) });
};

const runRemove = async (clientId: string, names: string[]) => {
    const ctx = context();
    const client = findClient(clientId);
    const harness = findHarness(client, clientId);
    if (harness) {
        printInfo(
            `polli mcp does not manage ${harness.label}'s MCP entries; disconnect it with \`polli harness ${harness.id} off\`.`,
        );
        return;
    }

    if (!client) {
        return fail(
            `Unknown client "${clientId}". Run polli mcp list to see the supported clients.`,
        );
    }
    if (!client.available(ctx)) {
        return fail(
            `${client.label} is not installed: no \`${client.bin}\` on PATH, so its \`mcp remove\` cannot run. Remove the Pollinations entries from ${client.configPaths(ctx).join(", ")} manually.`,
        );
    }

    let report: ReturnType<McpClient["remove"]>;
    try {
        report = client.remove(ctx, names);
    } catch (error) {
        return fail(`Failed to uninstall from ${client.label}`, error);
    }
    if (report.servers.length === 0) {
        printInfo(`No Pollinations MCP servers found in ${client.label}.`);
        return;
    }
    if (client.installed(ctx).length === 0) removeCachedKey(ctx, client.id);
    printSuccess(`${client.label}: removed ${report.servers.join(", ")}.`);
    printInfo(client.restartHint);
    for (const note of report.notes) printInfo(note);
    printResult(report);
};

const printStatus = (rows: McpStatus[]) => {
    if (getOutputMode() === "json") {
        printResult(rows);
        return;
    }
    printTable(
        rows.map((row) => ({
            client: row.client,
            label: row.label,
            installed: row.installed ? "yes" : "no",
            servers: row.servers.join(", "),
            config: row.config.join(", "),
        })),
        ["client", "label", "installed", "servers", "config"],
    );
};

const runStatus = async (clientId?: string) => {
    const ctx = context();
    if (clientId) {
        const client = findClient(clientId);
        const harness = findHarness(client, clientId);
        if (!client && !harness) {
            return fail(
                `Unknown client "${clientId}". Run polli mcp list to see the supported clients.`,
            );
        }
        const rows: McpStatus[] = [];
        if (client) rows.push(statusOf(client, ctx));
        if (harness) {
            rows.push(
                ...(await harnessStatusOf(ctx)).filter(
                    (row) => row.client === harness.id,
                ),
            );
        }
        printStatus(rows);
        return;
    }
    printStatus([
        ...MCP_CLIENTS.map((client) => statusOf(client, ctx)),
        ...(await harnessStatusOf(ctx)),
    ]);
};

export const mcpCommand = new Command("mcp")
    .description("Install Pollinations MCP servers into coding clients")
    .addCommand(
        new Command("list")
            .description("List the MCP catalog and the supported clients")
            .action(runList),
    )
    .addCommand(
        new Command("install")
            .description("Register Pollinations MCP servers in a client")
            .argument("<client>", "client id (see `polli mcp list`)")
            .argument("[servers...]", "catalog server ids; defaults to none")
            .option("--all", "Register every server in the live catalog")
            .option(
                "--no-browser",
                "Print the login URL instead of opening a browser",
            )
            .action(runInstall),
    )
    .addCommand(
        new Command("remove")
            .description("Remove Pollinations MCP servers from a client")
            .argument("<client>", "client id (see `polli mcp list`)")
            .argument(
                "[servers...]",
                "server names; defaults to every Pollinations entry",
            )
            .action(runRemove),
    )
    .addCommand(
        new Command("status")
            .description("Show where Pollinations MCP servers are registered")
            .argument("[client]", "limit the report to one client")
            .action(runStatus),
    )
    .addHelpText(
        "after",
        `
Examples:
  polli mcp list
  polli mcp install codex --all
  polli mcp install cursor pollinations exa
  polli mcp status
  polli mcp remove cursor
`,
    );
