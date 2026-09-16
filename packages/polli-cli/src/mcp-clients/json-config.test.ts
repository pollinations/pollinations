import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileAdapter, isPollinationsEntry } from "./json-config.js";
import type { McpCatalogServer, McpContext } from "./types.js";

const server: McpCatalogServer = {
    id: "pollinations",
    name: "Pollinations",
    url: "https://gen.pollinations.ai/mcp/pollinations",
};

const adapter = fileAdapter({
    id: "test-client",
    label: "Test Client",
    description: "test adapter",
    configPath: (ctx: McpContext) => join(ctx.home, "client.json"),
    container: ["mcpServers"],
    buildEntry: (server, key) => ({
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});

const readConfig = (home: string) =>
    JSON.parse(readFileSync(join(home, "client.json"), "utf-8")) as {
        mcpServers: Record<string, { headers: { Authorization: string } }>;
    };

describe("fileAdapter", () => {
    it("installs catalog servers as named entries", async () => {
        const home = mkdtempSync(join(tmpdir(), "mcp-test-"));
        const result = await adapter.install(
            { home, env: {} },
            [server],
            "sk_test",
        );
        const data = readConfig(home);
        expect(result.servers).toEqual(["pollinations"]);
        expect(data.mcpServers.pollinations.headers.Authorization).toBe(
            "Bearer sk_test",
        );
    });

    it("is idempotent across repeated installs", async () => {
        const home = mkdtempSync(join(tmpdir(), "mcp-test-"));
        const ctx = { home, env: {} };
        await adapter.install(ctx, [server], "sk_test");
        await adapter.install(ctx, [server], "sk_other");
        expect(Object.keys(readConfig(home).mcpServers)).toHaveLength(1);
    });

    it("removes only Pollinations-owned entries", async () => {
        const home = mkdtempSync(join(tmpdir(), "mcp-test-"));
        const path = join(home, "client.json");
        writeFileSync(
            path,
            JSON.stringify({
                mcpServers: { other: { url: "https://example.com" } },
            }),
        );
        await adapter.install({ home, env: {} }, [server], "sk_test");
        const result = await adapter.remove({ home, env: {} });
        expect(result.servers).toEqual(["pollinations"]);
        expect(Object.keys(readConfig(home).mcpServers)).toEqual(["other"]);
    });

    it("status reports current Pollinations servers", async () => {
        const home = mkdtempSync(join(tmpdir(), "mcp-test-"));
        const ctx = { home, env: {} };
        expect((await adapter.status(ctx)).servers).toEqual([]);
        await adapter.install(ctx, [server], "sk_test");
        expect((await adapter.status(ctx)).servers).toEqual(["pollinations"]);
    });
});

describe("isPollinationsEntry", () => {
    it("matches the entry name or a hosted /mcp URL", () => {
        expect(isPollinationsEntry("pollinations", {})).toBe(true);
        expect(isPollinationsEntry("pollinations-exa", {})).toBe(true);
        expect(
            isPollinationsEntry("x", {
                url: "https://gen.pollinations.ai/mcp/x",
            }),
        ).toBe(true);
        expect(isPollinationsEntry("other", { url: "https://x.com" })).toBe(
            false,
        );
    });
});
