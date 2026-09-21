import { resolveHarnessKey } from "../harnesses/keys.js";
import { applyWithSnapshot, restoreOrStrip } from "../harnesses/snapshot.js";
import type { HarnessContext } from "../harnesses/types.js";
import { fetchCatalog } from "./catalog.js";
import { MCP_CLIENTS } from "./clients.js";
import { clobberedNames, ownedNames, serverIdOf } from "./entries.js";
import type { McpClient, McpInstallOptions, McpResult } from "./types.js";

export const mcpClientIds = MCP_CLIENTS.map((client) => client.id);

const clientById = (id: string): McpClient => {
    const client = MCP_CLIENTS.find((candidate) => candidate.id === id);
    if (!client) {
        throw new Error(
            `Unknown client "${id}". Available: ${MCP_CLIENTS.map((c) => c.id).join(", ")}`,
        );
    }
    return client;
};

/** Every JSON envelope field name a Pollinations entry may use for its URL. */
const URL_FIELDS = ["url", "httpUrl", "serverUrl"] as const;

const selectServers = (
    catalog: Awaited<ReturnType<typeof fetchCatalog>>,
    requested: string[] | undefined,
) => {
    if (!requested || requested.length === 0) return catalog;
    const unknown = requested.filter(
        (id) => !catalog.some((server) => server.id === id),
    );
    if (unknown.length > 0) {
        throw new Error(
            `Unknown MCP server(s): ${unknown.join(", ")}. Live catalog: ${catalog.map((s) => s.id).join(", ")}`,
        );
    }
    return catalog.filter((server) => requested.includes(server.id));
};

const ownedTargets = (
    servers: Record<string, Record<string, unknown>>,
    urlFields: readonly string[],
    onlyServerIds: string[] | undefined,
): string[] => {
    const owned = ownedNames(servers, ...urlFields);
    if (!onlyServerIds || onlyServerIds.length === 0) return owned;
    // The CLI takes catalog server ids ("ffmpeg"); entries are named
    // "pollinations-ffmpeg" — match either the name or its server id.
    return owned.filter((name) =>
        onlyServerIds.some((id) => id === name || id === serverIdOf(name)),
    );
};

export const installMcp = async (
    ctx: HarnessContext,
    clientId: string,
    serverIds: string[] | undefined,
    options: McpInstallOptions,
): Promise<McpResult> => {
    const client = clientById(clientId);
    const catalog = await fetchCatalog();
    const selected = selectServers(catalog, serverIds);
    if (selected.length === 0) {
        throw new Error("No MCP server selected.");
    }
    // Prompt-input clients (VS Code) paste the key interactively instead of
    // storing it — reinstalling must not mint yet another key for the paste.
    const alreadyInstalled =
        client.secretMode === "input" &&
        client.installedServers(ctx).length > 0;
    const apiKey = alreadyInstalled
        ? ""
        : await resolveHarnessKey(
              {
                  id: `mcp-${client.id}`,
                  label: `${client.label} MCP`,
                  existingKey: client.readKey?.(ctx) ?? null,
              },
              options,
          );
    const entries = client.entries(selected, apiKey);
    let hints: string[] = [];
    applyWithSnapshot(ctx, `mcp-${client.id}`, client.files(ctx), () => {
        const current = client.readServers(ctx) ?? {};
        const collisions = clobberedNames(current, entries, ...URL_FIELDS);
        if (collisions.length > 0) {
            throw new Error(
                `Refusing to overwrite in ${client.label}: "${collisions.join('", "')}" already exist(s) with a different URL. Remove or rename them first.`,
            );
        }
        client.writeServers(ctx, { ...current, ...entries });
        // postInstall (e.g. Codex writing its .env) runs inside the snapshot
        // window, so the persisted afterHash covers its writes too and `off`
        // can still restore every file byte-identically.
        hints = client.postInstall?.(ctx, apiKey) ?? [];
    });
    if (client.secretMode === "input") {
        hints.push(
            alreadyInstalled
                ? "A Pollinations key prompt is already registered for this client — no new key was minted."
                : `Pollinations key for the prompt input: ${apiKey}`,
        );
    }
    return { ...statusMcp(ctx, clientId), hints };
};

export const offMcp = async (
    ctx: HarnessContext,
    clientId: string,
    serverIds: string[] | undefined,
) => {
    const client = clientById(clientId);
    let removed: string[] = [];
    const outcome = restoreOrStrip(
        ctx,
        `mcp-${client.id}`,
        client.files(ctx),
        () => {
            const servers = client.readServers(ctx);
            if (!servers) return false;
            const targets = ownedTargets(servers, [...URL_FIELDS], serverIds);
            if (targets.length === 0) return false;
            removed = targets;
            const next = Object.fromEntries(
                Object.entries(servers).filter(
                    ([name]) => !targets.includes(name),
                ),
            );
            client.writeServers(ctx, next);
            return true;
        },
    );
    const hints =
        removed.length > 0 ? (client.postStrip?.(ctx, removed) ?? []) : [];
    return { ...statusMcp(ctx, clientId), outcome, hints };
};

export const statusMcp = (ctx: HarnessContext, clientId: string): McpResult => {
    const client = clientById(clientId);
    return {
        client: client.id,
        label: client.label,
        restartHint: client.restartHint,
        installed: client.installedServers(ctx),
        catalogServerIds: [],
        files: client.files(ctx),
    };
};
