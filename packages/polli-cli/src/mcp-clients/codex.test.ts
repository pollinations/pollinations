import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "./codex.js";
import type { McpCatalogServer, McpContext } from "./types.js";

const server: McpCatalogServer = {
    id: "pollinations",
    name: "Pollinations",
    url: "https://gen.pollinations.ai/mcp/pollinations",
};

describe("codexAdapter", () => {
    const setup = () => {
        const home = mkdtempSync(join(tmpdir(), "codex-test-"));
        mkdirSync(join(home, ".codex"), { recursive: true });
        const path = join(home, ".codex", "config.toml");
        writeFileSync(
            path,
            '[mcp_servers.other]\ncommand = "uvx"\n\n[profile]\nname = "x"\n',
        );
        return { path, ctx: { home, env: {} } };
    };

    it("appends its tables and preserves foreign TOML", async () => {
        const { path, ctx } = setup();
        await codexAdapter.install(ctx, [server], "sk_test");
        const text = readFileSync(path, "utf-8");
        expect(text).toContain('[mcp_servers."pollinations"]');
        expect(text).toContain(
            'url = "https://gen.pollinations.ai/mcp/pollinations"',
        );
        expect(text).toContain('bearer_token_env_var = "POLLINATIONS_MCP_KEY"');
        expect(text).toContain("[mcp_servers.other]");
        expect(text).toContain("[profile]");
    });

    it("replaces its own tables on reinstall", async () => {
        const { path, ctx } = setup();
        await codexAdapter.install(ctx, [server], "sk_test");
        await codexAdapter.install(ctx, [server], "sk_new");
        const text = readFileSync(path, "utf-8");
        expect(text.match(/\[mcp_servers\."pollinations"/gu)).toHaveLength(1);
    });

    it("removes only its own tables", async () => {
        const { path, ctx } = setup();
        await codexAdapter.install(ctx, [server], "sk_test");
        const result = await codexAdapter.remove(ctx);
        const text = readFileSync(path, "utf-8");
        expect(result.servers).toEqual(["pollinations"]);
        expect(text).not.toContain("pollinations");
        expect(text).toContain("[mcp_servers.other]");
    });
});
