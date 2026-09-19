import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_URL } from "../lib/config.js";
import type { McpServer } from "./catalog.js";
import {
    codexInstalledIds,
    findClient,
    MCP_CLIENTS,
    type McpContext,
} from "./clients.js";
import { upsertEnvFile, writeJsonObject } from "./config-files.js";

const SERVERS: McpServer[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        url: `${BASE_URL}/mcp/pollinations`,
    },
    { id: "ffmpeg", name: "FFmpeg", url: `${BASE_URL}/mcp/ffmpeg` },
];

const freshCtx = (): McpContext => ({
    home: mkdtempSync(join(tmpdir(), "polli-mcp-home-")),
    env: {},
});

describe("client table", () => {
    it("covers all 13 clients in the issue's priority order", () => {
        expect(MCP_CLIENTS.map((client) => client.id)).toEqual([
            "claude-code",
            "codex",
            "vscode",
            "cursor",
            "opencode",
            "gemini",
            "copilot",
            "windsurf",
            "cline",
            "amp",
            "kiro",
            "zed",
            "warp",
        ]);
    });
});

describe("json config clients", () => {
    it("cursor installs url+headers entries and reports status", async () => {
        const ctx = freshCtx();
        const cursor = findClient("cursor");
        const result = await cursor?.install(ctx, SERVERS, "sk-test");
        expect(result?.installed.sort()).toEqual(["ffmpeg", "pollinations"]);
        const config = JSON.parse(
            readFileSync(join(ctx.home, ".cursor", "mcp.json"), "utf-8"),
        );
        expect(config.mcpServers.pollinations).toEqual({
            url: `${BASE_URL}/mcp/pollinations`,
            headers: { Authorization: "Bearer sk-test" },
        });
        expect(cursor?.status(ctx).installed.sort()).toEqual([
            "ffmpeg",
            "pollinations",
        ]);
    });

    it("re-install is idempotent and preserves foreign entries", async () => {
        const ctx = freshCtx();
        const cursor = findClient("cursor");
        await cursor?.install(ctx, SERVERS, "sk-one");
        await cursor?.install(ctx, [SERVERS[0]], "sk-two");
        const file = join(ctx.home, ".cursor", "mcp.json");
        const config = JSON.parse(readFileSync(file, "utf-8"));
        config.mcpServers.notion = { url: "https://mcp.notion.com/mcp" };
        writeJsonObject(file, config);
        await cursor?.install(ctx, [SERVERS[1]], "sk-two");
        const after = JSON.parse(readFileSync(file, "utf-8"));
        expect(Object.keys(after.mcpServers).sort()).toEqual([
            "ffmpeg",
            "notion",
            "pollinations",
        ]);
        expect(after.mcpServers.pollinations.headers.Authorization).toBe(
            "Bearer sk-two",
        );
    });

    it("install keeps a user's own entry that reuses a Pollinations server id", async () => {
        const ctx = freshCtx();
        const cursor = findClient("cursor");
        const file = join(ctx.home, ".cursor", "mcp.json");
        writeJsonObject(file, {
            mcpServers: { ffmpeg: { url: "https://elsewhere.example/mcp" } },
        });
        const result = await cursor?.install(ctx, SERVERS, "sk-test");
        const after = JSON.parse(readFileSync(file, "utf-8"));
        expect(after.mcpServers.ffmpeg).toEqual({
            url: "https://elsewhere.example/mcp",
        });
        expect(after.mcpServers.pollinations.headers.Authorization).toBe(
            "Bearer sk-test",
        );
        expect(result?.notes.join(" ")).toContain('"ffmpeg"');
    });

    it("remove deletes only Pollinations-owned entries", async () => {
        const ctx = freshCtx();
        const cursor = findClient("cursor");
        await cursor?.install(ctx, SERVERS, "sk-test");
        const file = join(ctx.home, ".cursor", "mcp.json");
        const config = JSON.parse(readFileSync(file, "utf-8"));
        // A user entry that happens to reuse our server id but points elsewhere.
        config.mcpServers.ffmpeg = { url: "https://elsewhere.example/mcp" };
        config.mcpServers.notion = { url: "https://mcp.notion.com/mcp" };
        writeJsonObject(file, config);
        const removed = await cursor?.remove(ctx);
        expect(removed?.removed).toEqual(["pollinations"]);
        const after = JSON.parse(readFileSync(file, "utf-8"));
        expect(Object.keys(after.mcpServers).sort()).toEqual([
            "ffmpeg",
            "notion",
        ]);
    });

    it("vscode writes servers + a password input instead of the literal key", async () => {
        const ctx = freshCtx();
        const vscode = findClient("vscode");
        const result = await vscode?.install(ctx, SERVERS, "sk-secret");
        const [file] = result?.files ?? [];
        const config = JSON.parse(readFileSync(file, "utf-8"));
        expect(file.endsWith(join("Code", "User", "mcp.json"))).toBe(true);
        expect(config.servers.pollinations.headers.Authorization).toBe(
            `Bearer \${input:pollinations-mcp-key}`,
        );
        expect(JSON.stringify(config)).not.toContain("sk-secret");
        expect(config.inputs).toEqual([
            {
                type: "promptString",
                id: "pollinations-mcp-key",
                description: "Pollinations API key",
                password: true,
            },
        ]);
        expect(result?.notes.join(" ")).toContain("sk-secret");
    });

    it("opencode uses the mcp table with type remote", async () => {
        const ctx = freshCtx();
        await findClient("opencode")?.install(ctx, [SERVERS[0]], "sk-test");
        const config = JSON.parse(
            readFileSync(
                join(ctx.home, ".config", "opencode", "opencode.json"),
                "utf-8",
            ),
        );
        expect(config.mcp.pollinations).toEqual({
            type: "remote",
            url: `${BASE_URL}/mcp/pollinations`,
            headers: { Authorization: "Bearer sk-test" },
            enabled: true,
        });
    });

    it("zed wires servers through the mcp-remote bridge", async () => {
        const ctx = freshCtx();
        const zed = findClient("zed");
        await zed?.install(ctx, [SERVERS[1]], "sk-test");
        const config = JSON.parse(
            readFileSync(
                join(ctx.home, ".config", "zed", "settings.json"),
                "utf-8",
            ),
        );
        expect(config.context_servers.ffmpeg.command.path).toBe("npx");
        expect(config.context_servers.ffmpeg.command.args).toContain(
            `${BASE_URL}/mcp/ffmpeg`,
        );
        // Bridge entries are still recognized as Pollinations-owned.
        expect(zed?.status(ctx).installed).toEqual(["ffmpeg"]);
        const removed = await zed?.remove(ctx);
        expect(removed?.removed).toEqual(["ffmpeg"]);
    });

    it("windsurf uses serverUrl; cline declares streamableHttp; kiro and warp use url", async () => {
        const ctx = freshCtx();
        await findClient("windsurf")?.install(ctx, [SERVERS[0]], "k");
        await findClient("cline")?.install(ctx, [SERVERS[0]], "k");
        await findClient("kiro")?.install(ctx, [SERVERS[0]], "k");
        await findClient("warp")?.install(ctx, [SERVERS[0]], "k");
        await findClient("copilot")?.install(ctx, [SERVERS[0]], "k");

        const windsurf = JSON.parse(
            readFileSync(
                join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
                "utf-8",
            ),
        );
        expect(windsurf.mcpServers.pollinations.serverUrl).toBe(
            `${BASE_URL}/mcp/pollinations`,
        );

        const cline = JSON.parse(
            readFileSync(join(ctx.home, ".cline", "mcp.json"), "utf-8"),
        );
        expect(cline.mcpServers.pollinations.type).toBe("streamableHttp");

        const kiro = JSON.parse(
            readFileSync(
                join(ctx.home, ".kiro", "settings", "mcp.json"),
                "utf-8",
            ),
        );
        expect(kiro.mcpServers.pollinations.url).toBe(
            `${BASE_URL}/mcp/pollinations`,
        );

        const warp = JSON.parse(
            readFileSync(join(ctx.home, ".warp", ".mcp.json"), "utf-8"),
        );
        expect(warp.mcpServers.pollinations.url).toBe(
            `${BASE_URL}/mcp/pollinations`,
        );

        const copilot = JSON.parse(
            readFileSync(
                join(ctx.home, ".copilot", "mcp-config.json"),
                "utf-8",
            ),
        );
        expect(copilot.mcpServers.pollinations.type).toBe("http");

        for (const id of ["windsurf", "cline", "kiro", "warp", "copilot"]) {
            expect(findClient(id)?.status(ctx).installed).toEqual([
                "pollinations",
            ]);
        }
    });
});

describe("existingKey recovery (idempotent key reuse)", () => {
    it("recovers the same key that install just wrote, for every JSON client", async () => {
        for (const id of [
            "cursor",
            "opencode",
            "copilot",
            "windsurf",
            "cline",
            "kiro",
            "warp",
            "zed",
        ]) {
            const ctx = freshCtx();
            const client = findClient(id);
            expect(client).toBeDefined();
            expect(client?.existingKey(ctx)).toBeNull();
            await client?.install(ctx, [SERVERS[0]], "sk-persisted");
            expect(client?.existingKey(ctx)).toBe("sk-persisted");
        }
    });

    it("vscode never reports a reusable key — the value is never written to disk", async () => {
        const ctx = freshCtx();
        const vscode = findClient("vscode");
        expect(vscode?.existingKey(ctx)).toBeNull();
        await vscode?.install(ctx, [SERVERS[0]], "sk-secret");
        expect(vscode?.existingKey(ctx)).toBeNull();
    });

    it("codex recovers the key from its .env file, not config.toml", () => {
        const ctx = freshCtx();
        const codex = findClient("codex");
        expect(codex?.existingKey(ctx)).toBeNull();
        upsertEnvFile(join(ctx.home, ".codex", ".env"), {
            POLLI_MCP_CODEX_API_KEY: "sk-codex",
        });
        expect(codex?.existingKey(ctx)).toBe("sk-codex");
    });

    it("claude-code and gemini recover a key from their own JSON config", () => {
        const ctx = freshCtx();
        writeJsonObject(join(ctx.home, ".claude.json"), {
            mcpServers: {
                pollinations: {
                    type: "http",
                    url: `${BASE_URL}/mcp/pollinations`,
                    headers: { Authorization: "Bearer sk-claude" },
                },
            },
        });
        expect(findClient("claude-code")?.existingKey(ctx)).toBe("sk-claude");

        writeJsonObject(join(ctx.home, ".gemini", "settings.json"), {
            mcpServers: {
                pollinations: {
                    url: `${BASE_URL}/mcp/pollinations`,
                    headers: { Authorization: "Bearer sk-gemini" },
                },
            },
        });
        expect(findClient("gemini")?.existingKey(ctx)).toBe("sk-gemini");
    });

    it("amp recovers a key nested under its own settings table", () => {
        const ctx = freshCtx();
        writeJsonObject(join(ctx.home, ".config", "amp", "settings.json"), {
            amp: {
                mcpServers: {
                    pollinations: {
                        url: `${BASE_URL}/mcp/pollinations`,
                        headers: { Authorization: "Bearer sk-amp" },
                    },
                },
            },
        });
        expect(findClient("amp")?.existingKey(ctx)).toBe("sk-amp");
    });
});

describe("codexInstalledIds", () => {
    it("parses owned [mcp_servers.*] sections from config.toml", () => {
        const toml = `
model = "gpt-5"

[mcp_servers.pollinations]
url = "${BASE_URL}/mcp/pollinations"
bearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"

[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"

[other]
value = 1
`;
        expect(codexInstalledIds(toml, BASE_URL)).toEqual(["pollinations"]);
    });

    it("handles quoted server names", () => {
        const toml = `[mcp_servers."ffmpeg"]\nurl = "${BASE_URL}/mcp/ffmpeg"\n`;
        expect(codexInstalledIds(toml, BASE_URL)).toEqual(["ffmpeg"]);
    });
});
