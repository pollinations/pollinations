import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HarnessContext } from "../harnesses/types.js";
import { fetchCatalog, filterServers } from "./catalog.js";
import {
    getClient,
    installIntoClient,
    isPolliEntry,
    keyEnvVar,
    MCP_CLIENTS,
} from "./clients.js";

const dirs: string[] = [];
afterEach(() => {
    while (dirs.length) {
        const d = dirs.pop();
        if (d) rmSync(d, { recursive: true, force: true });
    }
});

const tempCtx = (): HarnessContext => {
    const home = mkdtempSync(join(tmpdir(), "polli-mcp-"));
    dirs.push(home);
    return { home, env: {} };
};

const sample = [
    {
        id: "pollinations",
        name: "Pollinations",
        description: "x",
        url: "https://gen.pollinations.ai/mcp/pollinations",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description: "y",
        url: "https://gen.pollinations.ai/mcp/ffmpeg",
    },
];

describe("catalog", () => {
    it("fetches live catalog", async () => {
        const catalog = await fetchCatalog();
        expect(catalog.length).toBeGreaterThan(0);
        expect(catalog.some((s) => s.id === "pollinations")).toBe(true);
        expect(catalog.every((s) => s.url.includes("/mcp/"))).toBe(true);
    });

    it("falls back when fetch fails", async () => {
        const catalog = await fetchCatalog(async () => {
            throw new Error("offline");
        });
        expect(catalog.map((s) => s.id)).toContain("computer");
    });

    it("filters and rejects unknown ids", () => {
        expect(filterServers(sample, ["ffmpeg"]).map((s) => s.id)).toEqual([
            "ffmpeg",
        ]);
        expect(() => filterServers(sample, ["nope"])).toThrow(/Unknown/);
    });
});

describe("clients", () => {
    it("lists priority clients", () => {
        const ids = MCP_CLIENTS.map((c) => c.id);
        expect(ids.slice(0, 6)).toEqual([
            "claude-code",
            "codex",
            "vscode",
            "cursor",
            "opencode",
            "gemini",
        ]);
        expect(getClient("cursor")?.label).toBe("Cursor");
    });

    it("installs and removes cursor idempotently without touching strangers", () => {
        const ctx = tempCtx();
        const client = getClient("cursor");
        expect(client).toBeDefined();
        if (!client) throw new Error("missing cursor");
        const path = client.configPath(ctx);
        // seed unrelated entry
        installIntoClient(client, ctx, sample.slice(0, 1), "sk_test");
        const raw = JSON.parse(readFileSync(path, "utf8")) as {
            mcpServers: Record<string, unknown>;
        };
        raw.mcpServers.other = { url: "https://example.com" };
        // rewrite with stranger preserved via second install
        const again = getClient("cursor");
        expect(again).toBeDefined();
        if (!again) throw new Error("missing cursor");
        // manually write stranger then install
        mkdirSync(join(ctx.home, ".cursor"), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify(
                {
                    mcpServers: {
                        other: { url: "https://example.com" },
                        pollinations: raw.mcpServers.pollinations,
                    },
                },
                null,
                2,
            ),
        );
        again.write(ctx, sample, "sk_test2");
        const after = JSON.parse(readFileSync(path, "utf8")) as {
            mcpServers: Record<string, unknown>;
        };
        expect(after.mcpServers.other).toEqual({ url: "https://example.com" });
        expect(isPolliEntry(after.mcpServers.pollinations)).toBe(true);
        expect(isPolliEntry(after.mcpServers.ffmpeg)).toBe(true);
        expect(again.remove(ctx, ["ffmpeg"])).toBe(true);
        const trimmed = JSON.parse(readFileSync(path, "utf8")) as {
            mcpServers: Record<string, unknown>;
        };
        expect(trimmed.mcpServers.ffmpeg).toBeUndefined();
        expect(trimmed.mcpServers.other).toEqual({
            url: "https://example.com",
        });
        expect(trimmed.mcpServers.pollinations).toBeTruthy();
        expect(again.remove(ctx)).toBe(true);
        const final = JSON.parse(readFileSync(path, "utf8")) as {
            mcpServers?: Record<string, unknown>;
        };
        expect(final.mcpServers?.pollinations).toBeUndefined();
        expect(final.mcpServers?.other).toEqual({ url: "https://example.com" });
    });

    it("writes codex bearer_token_env_var and env helper", () => {
        const ctx = tempCtx();
        const client = getClient("codex");
        expect(client).toBeDefined();
        if (!client) throw new Error("missing codex");
        client.write(ctx, sample.slice(0, 1), "sk_secret");
        const text = readFileSync(client.configPath(ctx), "utf8");
        expect(text).toContain("[mcp_servers.pollinations]");
        expect(text).toContain(
            `bearer_token_env_var = "${keyEnvVar("codex")}"`,
        );
        expect(text).not.toContain("sk_secret");
        const env = readFileSync(
            join(ctx.home, ".pollinations", "mcp-codex.env"),
            "utf8",
        );
        expect(env).toContain("sk_secret");
        expect(client.status(ctx).installed).toEqual(["pollinations"]);
        expect(client.remove(ctx)).toBe(true);
        expect(client.status(ctx).count).toBe(0);
    });

    it("uses vscode inputs instead of literal key", () => {
        const ctx = tempCtx();
        const client = getClient("vscode");
        expect(client).toBeDefined();
        if (!client) throw new Error("missing vscode");
        client.write(ctx, sample.slice(0, 1), "sk_secret");
        const cfg = JSON.parse(
            readFileSync(client.configPath(ctx), "utf8"),
        ) as {
            inputs: Array<{ id: string }>;
            servers: Record<string, { headers?: { Authorization?: string } }>;
        };
        expect(cfg.inputs.some((i) => i.id === "polli-mcp-key")).toBe(true);
        expect(cfg.servers.pollinations?.headers?.Authorization).toBe(
            "$" + "{input:polli-mcp-key}",
        );
        expect(JSON.stringify(cfg)).not.toContain("sk_secret");
    });
});
