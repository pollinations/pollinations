import { homedir } from "node:os";
import { Command } from "commander";
import { HARNESSES } from "../harnesses/index.js";
import { resolveHarnessKey } from "../harnesses/keys.js";
import type {
    HarnessAdapter,
    HarnessContext,
    OffOutcome,
} from "../harnesses/types.js";
import {
    fail,
    printError,
    printInfo,
    printSuccess,
    printTable,
} from "../lib/output.js";
import type { McpServer } from "../mcp/catalog.js";
import { fetchMcpCatalog } from "../mcp/catalog.js";
import type { McpClient, McpReport } from "../mcp/clients.js";
import {
    clientFiles,
    clientStatus,
    existingSecret,
    findMcpClient,
    type InstalledEntry,
    installClient,
    installedEntries,
    MCP_CLIENTS,
    removeClient,
} from "../mcp/clients.js";
import { describeVerify, verifyServer } from "../mcp/verify.js";

const ROW_COLUMNS = ["client", "label", "servers", "files"];
const VERIFY_COLUMNS = ["client", "server", "url", "check"];

/** `printTable` takes flat records, so reports and catalog rows are mapped. */
const reportRow = (report: McpReport): Record<string, string> => ({
    client: report.client,
    label: report.label,
    servers: report.servers.join(", "),
    files: report.files.join(", "),
});

const serverRow = (server: McpServer): Record<string, string> => ({
    id: server.id,
    name: server.name,
    url: server.url,
    description: server.description,
});

const verifyRow = (
    client: string,
    server: string,
    url: string,
    check: string,
): Record<string, string> => ({ client, server, url, check });

/** Handshake each entry we just wrote, so `add --verify` reports the truth. */
const verifyInstalled = async (
    client: McpClient,
    entries: { id: string; url: string }[],
    secret: string,
) => {
    const rows: Record<string, string>[] = [];
    let failed = 0;
    for (const entry of entries) {
        const result = await verifyServer(entry.url, secret);
        if (result.outcome !== "ok") failed += 1;
        rows.push(
            verifyRow(client.id, entry.id, entry.url, describeVerify(result)),
        );
    }
    if (rows.length > 0) printTable(rows, VERIFY_COLUMNS);
    if (failed > 0) process.exitCode = 1;
};

/** Check whatever is installed for these clients, reading keys from disk. */
const verifyReports = async (clients: McpClient[]) => {
    const found: { client: McpClient; entry: InstalledEntry }[] = [];
    for (const client of clients) {
        for (const entry of installedEntries(context(), client)) {
            found.push({ client, entry });
        }
    }
    if (found.length === 0) {
        printInfo("Nothing installed to verify.");
        return;
    }
    const rows: Record<string, string>[] = [];
    let failed = 0;
    for (const { client, entry } of found) {
        const result = await verifyServer(entry.url, entry.secret);
        if (result.outcome !== "ok") failed += 1;
        rows.push(
            verifyRow(client.id, entry.id, entry.url, describeVerify(result)),
        );
    }
    printTable(rows, VERIFY_COLUMNS);
    if (failed > 0) process.exitCode = 1;
};

const OFF_MESSAGES: Record<OffOutcome, string> = {
    restored: "original config restored.",
    stripped: "Pollinations entries removed.",
    unchanged: "was not connected; nothing changed.",
};

const context = (): HarnessContext => ({ home: homedir(), env: process.env });

const findHarness = (id: string) =>
    HARNESSES.find((harness) => harness.id === id);

const clientIds = () => MCP_CLIENTS.map((client) => client.id);

const requireClient = (id: string): McpClient => {
    const client = findMcpClient(id);
    if (!client) {
        return fail(
            `Unknown client "${id}". Supported: ${clientIds().join(", ")}, or all.`,
        );
    }
    return client;
};

const catalogOrFail = async (): Promise<McpServer[]> => {
    try {
        return await fetchMcpCatalog();
    } catch (error) {
        return fail("Failed to fetch the MCP catalog", error);
    }
};

const selectServers = (catalog: McpServer[], ids?: string[]) => {
    if (!ids?.length) return catalog;
    const unknown = ids.filter(
        (id) => !catalog.some((server) => server.id === id),
    );
    if (unknown.length > 0) {
        const available = catalog.map((server) => server.id).join(", ");
        fail(
            `Unknown server(s): ${unknown.join(", ")}. Available: ${available}`,
        );
    }
    return catalog.filter((server) => ids.includes(server.id));
};

type Target =
    | { kind: "client"; client: McpClient }
    | { kind: "harness"; harness: HarnessAdapter };

/** Named targets; `all` resolves to every client the predicate accepts. */
const resolveTargets = (ids: string[], all: () => McpClient[]): Target[] => {
    if (ids.includes("all")) {
        return all().map((client): Target => ({ kind: "client", client }));
    }
    return ids.map((id): Target => {
        const client = findMcpClient(id);
        if (client) return { kind: "client", client };
        const harness = findHarness(id);
        if (harness) return { kind: "harness", harness };
        return { kind: "client", client: requireClient(id) };
    });
};

/** Run one target at a time so one broken client cannot stop the rest. */
const runTargets = async (
    targets: Target[],
    run: (target: Target) => Promise<McpReport | null>,
) => {
    const rows: McpReport[] = [];
    let failed = 0;
    for (const target of targets) {
        try {
            const row = await run(target);
            if (row) rows.push(row);
        } catch (error) {
            const label =
                target.kind === "client"
                    ? target.client.label
                    : target.harness.label;
            printError(
                `${label}: ${error instanceof Error ? error.message : error}`,
            );
            failed += 1;
        }
    }
    if (rows.length > 0) printTable(rows.map(reportRow), ROW_COLUMNS);
    if (failed > 0) process.exitCode = 1;
};

const installInto = async (
    ctx: HarnessContext,
    client: McpClient,
    servers: McpServer[],
    browser: boolean,
    verify: boolean,
): Promise<McpReport> => {
    const secret = await resolveHarnessKey(
        {
            id: `mcp-${client.id}`,
            label: client.label,
            existingKey: existingSecret(ctx, client),
        },
        { browser },
    );
    const installed = installClient(ctx, client, servers, secret);
    const notes = client.notes?.(ctx, secret) ?? [];
    printSuccess(`${client.label}: ${installed.join(", ")} installed.`);
    printInfo(client.restartHint);
    for (const note of notes) printInfo(note);
    if (verify) {
        await verifyInstalled(
            client,
            servers.map((server) => ({ id: server.id, url: server.url })),
            secret,
        );
    }
    return {
        client: client.id,
        label: client.label,
        servers: installed,
        files: clientFiles(ctx, client),
        notes: notes.length > 0 ? notes : undefined,
    };
};

const connectHarness = async (
    ctx: HarnessContext,
    harness: HarnessAdapter,
    servers: McpServer[],
    browser: boolean,
): Promise<McpReport> => {
    if (servers.some((server) => server.id !== "pollinations")) {
        fail(
            `${harness.label} wires the pollinations server only. Run: polli harness ${harness.id} on`,
        );
    }
    const status = await harnessStatus(ctx, harness);
    if (!status) {
        return fail(
            `${harness.label} does not register MCP servers. Run: polli harness ${harness.id} on to set it up for Pollinations models.`,
        );
    }
    const result = await harness.on(ctx, { mcp: true, browser });
    printSuccess(`${harness.label} now uses Pollinations.`);
    printInfo(`Managed by polli harness ${harness.id}. ${harness.restartHint}`);
    return {
        client: harness.id,
        label: harness.label,
        servers: ["pollinations"],
        files: result.files,
    };
};

const disconnectHarness = async (
    ctx: HarnessContext,
    harness: HarnessAdapter,
): Promise<McpReport> => {
    const status = await harnessStatus(ctx, harness);
    if (!status) {
        return fail(
            `${harness.label} does not register MCP servers. Run: polli harness ${harness.id} off to remove its Pollinations setup.`,
        );
    }
    const result = await harness.off(ctx);
    printSuccess(
        `${harness.label}: ${OFF_MESSAGES[result.outcome ?? "unchanged"]}`,
    );
    return {
        client: harness.id,
        label: harness.label,
        servers: [],
        files: result.files,
    };
};

/** Harness rows carry MCP state only for harnesses that install MCP servers. */
const harnessStatus = async (
    ctx: HarnessContext,
    harness: HarnessAdapter,
): Promise<McpReport | null> => {
    const result = await Promise.resolve(harness.status(ctx)).catch(() => null);
    if (!result || result.mcp === undefined) return null;
    return {
        client: harness.id,
        label: harness.label,
        servers: result.mcp ? ["pollinations"] : [],
        files: result.files,
    };
};

const list = new Command("list")
    .description("List the MCP servers in the live catalog")
    .action(async () => {
        const catalog = await catalogOrFail();
        printTable(catalog.map(serverRow), [
            "id",
            "name",
            "url",
            "description",
        ]);
    });

/** Options commander passes to the `add` action. */
type AddOptions = { server?: string[]; browser: boolean; verify: boolean };

const add = new Command("add")
    .description("Install Pollinations MCP servers into one or more clients")
    .argument("<clients...>", `client ids (${clientIds().join(", ")}) or all`)
    .option("--server <id...>", "Catalog server id(s); default: all of them")
    .option("--no-browser", "Print the login URL instead of opening a browser")
    .option(
        "--verify",
        "Check each installed server with a live initialize handshake",
    )
    .action(async (ids: string[], options: AddOptions) => {
        const ctx = context();
        const catalog = await catalogOrFail();
        const servers = selectServers(catalog, options.server);
        const targets = resolveTargets(ids, () =>
            MCP_CLIENTS.filter((client) => client.detect(ctx)),
        );
        if (targets.length === 0) {
            printInfo(
                `No supported clients found. Try: ${clientIds().join(", ")}.`,
            );
            return;
        }
        if (ids.includes("all")) {
            for (const client of MCP_CLIENTS) {
                if (!client.detect(ctx)) {
                    printInfo(`${client.label} was not found; skipped.`);
                }
            }
        }
        await runTargets(targets, (target) =>
            target.kind === "harness"
                ? connectHarness(ctx, target.harness, servers, options.browser)
                : installInto(
                      ctx,
                      target.client,
                      servers,
                      options.browser,
                      options.verify,
                  ),
        );
    });

const remove = new Command("remove")
    .description("Remove Pollinations MCP servers from one or more clients")
    .argument("<clients...>", "client ids, or all")
    .action(async (ids: string[]) => {
        const ctx = context();
        const targets = resolveTargets(ids, () =>
            MCP_CLIENTS.filter(
                (client) => clientStatus(ctx, client).servers.length > 0,
            ),
        );
        if (targets.length === 0) {
            printInfo("Nothing installed for any supported client.");
            return;
        }
        await runTargets(targets, async (target) => {
            if (target.kind === "harness") {
                return disconnectHarness(ctx, target.harness);
            }
            const { client } = target;
            const { removed, leftover } = removeClient(ctx, client);
            if (removed.length === 0 && leftover.length === 0) {
                printInfo(`${client.label}: nothing installed.`);
            } else {
                printSuccess(`${client.label}: removed ${removed.join(", ")}.`);
            }
            if (leftover.length > 0) {
                printInfo(
                    `${client.label} keeps ${leftover.join(", ")} in ${clientFiles(ctx, client)[0]}; remove them there by hand.`,
                );
            }
            return {
                client: client.id,
                label: client.label,
                servers: removed,
                files: clientFiles(ctx, client),
            };
        });
    });

/** Options commander passes to the `status` action. */
type StatusOptions = { verify: boolean };

const status = new Command("status")
    .description("Show which Pollinations MCP servers are installed per client")
    .argument("[client]", "limit the report to one client id")
    .option(
        "--verify",
        "Handshake every installed server and report what it answers",
    )
    .action(async (id: string | undefined, options: StatusOptions) => {
        const ctx = context();
        if (id) {
            const client = findMcpClient(id);
            if (client) {
                printTable([reportRow(clientStatus(ctx, client))], ROW_COLUMNS);
                if (options.verify) await verifyReports([client]);
                return;
            }
            const harness = findHarness(id);
            if (!harness) return fail(`Unknown client "${id}".`);
            const row = await harnessStatus(ctx, harness);
            if (row) printTable([reportRow(row)], ROW_COLUMNS);
            return;
        }
        const rows: McpReport[] = MCP_CLIENTS.map((client) =>
            clientStatus(ctx, client),
        );
        for (const harness of HARNESSES) {
            const row = await harnessStatus(ctx, harness);
            if (row) rows.push(row);
        }
        printTable(rows.map(reportRow), ROW_COLUMNS);
        if (options.verify) await verifyReports(MCP_CLIENTS);
    });

export const mcpCommand = new Command("mcp")
    .description("Install Pollinations MCP servers into coding agents")
    .addHelpText(
        "after",
        "\nCatalog: https://gen.pollinations.ai/mcp\nOnly harnesses that register MCP servers are wired here (dsh). For the others: polli harness <id> on\npolli mcp status --verify checks every installed server with a live initialize handshake\n",
    )
    .addCommand(list)
    .addCommand(add)
    .addCommand(remove)
    .addCommand(status);
