import { join } from "node:path";
import {
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "../harnesses/fs.js";
import type { McpContext } from "./types.js";

/** Dedicated key name for a client, visible in enter.pollinations.ai/keys. */
export const mcpKeyName = (clientId: string) => `polli-mcp-${clientId}`;

const cachePath = (ctx: McpContext, clientId: string) =>
    join(ctx.home, ".pollinations", "mcp", `${clientId}.json`);

/**
 * Clients that keep the key in their own secret store (VS Code prompts for it
 * and never writes it to mcp.json) cannot tell us which key they use, so polli
 * remembers what it minted. That keeps a second install idempotent instead of
 * piling up keys.
 */
export const readCachedKey = (
    ctx: McpContext,
    clientId: string,
): string | null => {
    const text = readTextIfExists(cachePath(ctx, clientId));
    if (!text) return null;
    try {
        const parsed = JSON.parse(text) as { key?: unknown };
        return typeof parsed.key === "string" && parsed.key ? parsed.key : null;
    } catch {
        return null;
    }
};

export const writeCachedKey = (
    ctx: McpContext,
    clientId: string,
    key: string,
) =>
    writeTextAtomic(
        cachePath(ctx, clientId),
        `${JSON.stringify({ key }, null, 2)}\n`,
        0o600,
    );

export const removeCachedKey = (ctx: McpContext, clientId: string) =>
    removeIfExists(cachePath(ctx, clientId));
