import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { writeJsonObject } from "./config-files.js";

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

const client = (id: string) => {
    const found = findClient(id);
    if (!found) throw new Error(`Client "${id}" not found`);
    return found;
};

describe("client table", () => {
    it("covers all 13 clients in the issue's priority order", () => {
        expect(MCP_CLIENTS.map((c) => c.id)).toEqual([
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
        const cursor = client("cursor");
        const result = await cursor.install(ctx, SERVERS, "sk-test");
        expect(result.installed.sort()).toEqual(["ffmpeg", "pollinations"]);
        const config = JSON.parse(
            readFileSync(join(ctx.home, ".cursor", "mcp.json"), "utf-8"),
        );
        expect(config.mcpServers.pollinations).toEqual({
            url: `${BASE_URL}/mcp/pollinations`,
            headers: { Authorization: "Bearer sk-test" },
        });
        expect(cursor.status(ctx).installed.sort()).toEqual([
            "ffmpeg",
            "pollinations",
        ]);
    });

    it("re-install is idempotent and preserves foreign entries", async () => {
        const ctx = freshCtx();
        const cursor = client("cursor");
        await cursor.install(ctx, SERVERS, "sk-one");
        await cursor.install(ctx, [SERVERS[0]], "sk-two");
        const file = join(ctx.home, ".cursor", "mcp.json");
        const config = JSON.parse(readFileSync(file, "utf-8"));
        config.mcpServers.notion = { url: "https://mcp.notion.com/mcp" };
        writeJsonObject(file, config);
        await cursor.install(ctx, [SERVERS[1]], "sk-two");
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

    it("install never overwrites a foreign entry that reuses a server id", async () => {
        const ctx = freshCtx();
        const cursor = client("cursor");
        await cursor.install(ctx, SERVERS, "sk-test");
        const file = join(ctx.home, ".cursor", "mcp.json");
        const config = JSON.parse(readFileSync(file, "utf-8"));
        config.mcpServers.ffmpeg = { url: "https://elsewhere.example/mcp" };
        writeJsonObject(file, config);
        const result = await cursor.install(ctx, SERVERS, "sk-test");
        const after = JSON.parse(readFileSync(file, "utf-8"));
        expect(after.mcpServers.ffmpeg).toEqual({
            url: "https://elsewhere.example/mcp",
        });
        expect(result.installed).toEqual(["pollinations"]);
        expect(
            result.notes.some((note) =>
                note.includes('non-Pollinations server "ffmpeg"'),
            ),
        ).toBe(true);
    });

    it("remove deletes only Pollinations-owned entries", async () => {
        const ctx = freshCtx();
        const cursor = client("cursor");
        await cursor.install(ctx, SERVERS, "sk-test");
        const file = join(ctx.home, ".cursor", "mcp.json");
        const config = JSON.parse(readFileSync(file, "utf-8"));
        config.mcpServers.ffmpeg = { url: "https://elsewhere.example/mcp" };
        config.mcpServers.notion = { url: "https://mcp.notion.com/mcp" };
        writeJsonObject(file, config);
        const removed = await cursor.remove(ctx);
        expect(removed.removed).toEqual(["pollinations"]);
        const after = JSON.parse(readFileSync(file, "utf-8"));
        expect(Object.keys(after.mcpServers).sort()).toEqual([
            "ffmpeg",
            "notion",
        ]);
    });

    it("remove scoped to server ids leaves others intact", async () => {
        const ctx = freshCtx();
        const cursor = client("cursor");
        await cursor.install(ctx, SERVERS, "sk-test");
        const removed = await cursor.remove(ctx, ["ffmpeg"]);
        expect(removed.removed).toEqual(["ffmpeg"]);
        expect(cursor.status(ctx).installed).toEqual(["pollinations"]);
    });

    it("vscode writes servers + a password input instead of the literal key", async () => {
        const ctx = freshCtx();
        const vscode = client("vscode");
        const result = await vscode.install(ctx, SERVERS, "sk-secret");
        const [file] = result.files;
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
        expect(result.notes.join(" ")).toContain("sk-secret");
    });

    it("opencode uses the mcp table with type remote", async () => {
        const ctx = freshCtx();
        await client("opencode").install(ctx, [SERVERS[0]], "sk-test");
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
        const zed = client("zed");
        await zed.install(ctx, [SERVERS[1]], "sk-test");
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
        expect(zed.status(ctx).installed).toEqual(["ffmpeg"]);
        const removed = await zed.remove(ctx);
        expect(removed.removed).toEqual(["ffmpeg"]);
    });

    it("windsurf, cline, kiro, warp, and copilot use their documented shapes", async () => {
        const ctx = freshCtx();
        await client("windsurf").install(ctx, [SERVERS[0]], "k");
        await client("cline").install(ctx, [SERVERS[0]], "k");
        await client("kiro").install(ctx, [SERVERS[0]], "k");
        await client("warp").install(ctx, [SERVERS[0]], "k");
        await client("copilot").install(ctx, [SERVERS[0]], "k");

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
            expect(client(id).status(ctx).installed).toEqual(["pollinations"]);
        }
    });
});

describe("key recovery for reinstalls", () => {
    it("cursor recovers the key from owned entry headers", async () => {
        const ctx = freshCtx();
        const cursor = client("cursor");
        await cursor.install(ctx, SERVERS, "sk-stored");
        expect(cursor.existingKey?.(ctx)).toBe("sk-stored");
    });

    it("json clients return null before any install", () => {
        const ctx = freshCtx();
        expect(client("cursor").existingKey?.(ctx)).toBeNull();
        expect(client("opencode").existingKey?.(ctx)).toBeNull();
    });

    it("never recovers a key from a foreign entry", () => {
        const ctx = freshCtx();
        writeJsonObject(join(ctx.home, ".cursor", "mcp.json"), {
            mcpServers: {
                notion: {
                    url: "https://mcp.notion.com/mcp",
                    headers: { Authorization: "Bearer sk-foreign" },
                },
            },
        });
        expect(client("cursor").existingKey?.(ctx)).toBeNull();
    });

    it("vscode does not recover: the literal key lives in secret storage", async () => {
        const ctx = freshCtx();
        const vscode = client("vscode");
        await vscode.install(ctx, SERVERS, "sk-secret");
        expect(vscode.existingKey?.(ctx)).toBeNull();
    });

    it("codex recovers the key from its .env file", () => {
        const ctx = freshCtx();
        mkdirSync(join(ctx.home, ".codex"));
        writeFileSync(
            join(ctx.home, ".codex", ".env"),
            "POLLI_MCP_CODEX_API_KEY=sk-codex\n",
            { mode: 0o600 },
        );
        expect(client("codex").existingKey?.(ctx)).toBe("sk-codex");
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

    it("ignores a url outside the gateway", () => {
        const toml = `[mcp_servers.notion]\nurl = "https://mcp.notion.com/mcp"\n`;
        expect(codexInstalledIds(toml, BASE_URL)).toEqual([]);
    });
});
