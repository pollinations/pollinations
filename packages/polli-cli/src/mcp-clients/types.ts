export interface McpContext {
    /** Home directory client configs are resolved against. */
    home: string;
    env: NodeJS.ProcessEnv;
}

/** One MCP server from the live catalog (GET /mcp). */
export interface McpCatalogServer {
    id: string;
    name: string;
    description?: string;
    /** Hosted Streamable-HTTP endpoint with Bearer auth. */
    url: string;
}

export interface McpClientResult {
    client: string;
    label: string;
    /** Entry names written by install, or stripped entries after remove. */
    servers: string[];
    /** Config files touched (or inspected by status). */
    files: string[];
    /** Whether the client looks present on this machine. */
    detected?: boolean;
}

/** One client integration. Each adapter owns its config strategy. */
export interface McpClientAdapter {
    id: string;
    label: string;
    description: string;
    /** Whether the client is present and can be configured. */
    detect(ctx: McpContext): boolean;
    install(
        ctx: McpContext,
        servers: McpCatalogServer[],
        key: string,
    ): Promise<McpClientResult> | McpClientResult;
    remove(ctx: McpContext): Promise<McpClientResult> | McpClientResult;
    status(ctx: McpContext): Promise<McpClientResult> | McpClientResult;
}
