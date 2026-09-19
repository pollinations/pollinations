import type { McpServer } from "./catalog.js";

/** Home + environment a client's config is resolved against (same shape as harnesses). */
export interface McpContext {
    home: string;
    env: NodeJS.ProcessEnv;
}

/** A type alias, not an interface, so reports print through printResult. */
export type McpReport = {
    client: string;
    label: string;
    servers: string[];
    files: string[];
    notes: string[];
};

export interface McpStatus {
    client: string;
    label: string;
    kind: "mcp" | "harness";
    installed: boolean;
    servers: string[];
    config: string[];
}

/**
 * One client polli can register Pollinations MCP servers in. Clients that ship
 * an `mcp add` command use it; the rest get their config file edited in place.
 */
export interface McpClient {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    /** Command the client is installed as, for CLI-driven clients. */
    bin?: string;
    available(ctx: McpContext): boolean;
    configPaths(ctx: McpContext): string[];
    /** Names of the Pollinations servers currently registered in this client. */
    installed(ctx: McpContext): string[];
    /** Key this client already uses, when its config exposes it. */
    existingKey(ctx: McpContext): string | null;
    install(ctx: McpContext, servers: McpServer[], key: string): McpReport;
    remove(ctx: McpContext, names: string[]): McpReport;
}
