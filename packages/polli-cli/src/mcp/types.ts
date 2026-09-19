import type { HarnessContext } from "../harnesses/types.js";
import type { McpCatalogServer } from "./catalog.js";

/** How the API key lands in the client's config. */
export type McpSecretMode = "literal" | "env-var-file" | "input";

export interface McpEntryRef {
    name: string;
    serverId: string;
}

export interface McpResult {
    client: string;
    label: string;
    restartHint: string;
    installed: McpEntryRef[];
    catalogServerIds: string[];
    files: string[];
    outcome?: "restored" | "stripped" | "unchanged";
    hints?: string[];
}

/**
 * One client integration. Adapters expose a servers-map API (read/mutate/
 * write) so the shared engine can upsert, strip and report Pollinations-owned
 * entries without knowing the config format (JSON envelope vs TOML).
 */
export interface McpClient {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    secretMode: McpSecretMode;
    /** All files this client may touch (for snapshots). */
    files: (ctx: HarnessContext) => string[];
    /** The servers map currently in the client's config (null = no config). */
    readServers: (
        ctx: HarnessContext,
    ) => Record<string, Record<string, unknown>> | null;
    /** Persist the servers map, preserving everything else in the config. */
    writeServers: (
        ctx: HarnessContext,
        servers: Record<string, Record<string, unknown>>,
    ) => void;
    /** Build the entries for the selected catalog servers. */
    entries: (
        servers: McpCatalogServer[],
        apiKey: string,
    ) => Record<string, Record<string, unknown>>;
    /** Pollinations-owned entries currently installed. */
    installedServers: (ctx: HarnessContext) => McpEntryRef[];
    /** Recover an existing stored key for reuse (optional). */
    readKey?: (ctx: HarnessContext) => string | null;
    /** After a successful install (store env var file, add input hints...). */
    postInstall?: (ctx: HarnessContext, apiKey: string) => string[];
    /** After a strip that removed entries (cleanup, e.g. remove env var). */
    postStrip?: (ctx: HarnessContext, removed: string[]) => string[];
}

export interface McpInstallOptions {
    browser?: boolean;
}
