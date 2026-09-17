import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveServers } from "./catalog.js";
import {
    codexAddArgs,
    codexInstalledIds,
    findClient,
    MCP_CLIENTS,
} from "./clients.js";
import {
    isOwnedEntry,
    readJsonObject,
    upsertEnvFile,
    writeJsonObject,
} from "./config.js";
import { getStoredKey, removeStoredKey, storeKey } from "./keys.js";

describe("config", () => {
    const tmpDir = join(process.cwd(), ".tmp-test-mcp");
    const configFile = join(tmpDir, "config.json");
    const envFile = join(tmpDir, ".env");

    beforeEach(() => {
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe("readJsonObject", () => {
        it("returns empty object for non-existent file", () => {
            expect(readJsonObject(join(tmpDir, "missing.json"))).toEqual({});
        });

        it("reads existing JSON object", () => {
            writeJsonObject(configFile, { foo: "bar" });
            expect(readJsonObject(configFile)).toEqual({ foo: "bar" });
        });

        it("throws on non-object JSON", () => {
            writeFileSync(configFile, "[1, 2, 3]");
            expect(() => readJsonObject(configFile)).toThrow(
                "does not contain a JSON object",
            );
        });
    });

    describe("writeJsonObject", () => {
        it.runIf(process.platform !== "win32")(
            "creates file with secure permissions",
            () => {
                writeJsonObject(configFile, { test: true });
                expect(existsSync(configFile)).toBe(true);
                const mode = statSync(configFile).mode & 0o777;
                expect(mode).toBe(0o600);
            },
        );

        it("updates existing file", () => {
            writeJsonObject(configFile, { a: 1 });
            writeJsonObject(configFile, { b: 2 });
            expect(readJsonObject(configFile)).toEqual({ b: 2 });
        });
    });

    describe("isOwnedEntry", () => {
        it("returns true for entries with gateway URL", () => {
            expect(
                isOwnedEntry({ url: "https://gen.pollinations.ai/mcp/flux" }),
            ).toBe(true);
        });

        it("returns true for entries with serverUrl", () => {
            expect(
                isOwnedEntry({
                    serverUrl: "https://gen.pollinations.ai/mcp/flux",
                }),
            ).toBe(true);
        });

        it("returns false for entries without gateway URL", () => {
            expect(isOwnedEntry({ url: "https://example.com" })).toBe(false);
        });

        it("returns false for non-objects", () => {
            expect(isOwnedEntry(null)).toBe(false);
            expect(isOwnedEntry("string")).toBe(false);
        });

        it("checks args array for gateway URLs", () => {
            expect(
                isOwnedEntry({
                    command: "some-cli",
                    args: [
                        "mcp",
                        "add",
                        "https://gen.pollinations.ai/mcp/flux",
                    ],
                }),
            ).toBe(true);
        });
    });

    describe("upsertEnvFile", () => {
        it("creates env file with values", () => {
            upsertEnvFile(envFile, { KEY: "value" });
            const content = readFileSync(envFile, "utf-8");
            expect(content).toContain("KEY=value");
        });

        it("updates existing values", () => {
            writeFileSync(envFile, "OLD=old\n");
            upsertEnvFile(envFile, { OLD: "new" });
            const content = readFileSync(envFile, "utf-8");
            expect(content).toContain("OLD=new");
            expect(content).not.toContain("OLD=old");
        });

        it("preserves other values", () => {
            writeFileSync(envFile, "KEEP=keep\n");
            upsertEnvFile(envFile, { ADD: "added" });
            const content = readFileSync(envFile, "utf-8");
            expect(content).toContain("KEEP=keep");
            expect(content).toContain("ADD=added");
        });
    });
});

describe("keys", () => {
    it("stores and retrieves keys", () => {
        storeKey("test-client", "sk_test_key");
        expect(getStoredKey("test-client")).toBe("sk_test_key");
        removeStoredKey("test-client");
        expect(getStoredKey("test-client")).toBeNull();
    });
});

describe("catalog", () => {
    it("resolves all servers when no request", () => {
        const catalog = [
            { id: "a", name: "A", url: "http://a" },
            { id: "b", name: "B", url: "http://b" },
        ];
        expect(resolveServers(catalog, undefined)).toEqual(catalog);
    });

    it("resolves requested servers by id", () => {
        const catalog = [
            { id: "a", name: "A", url: "http://a" },
            { id: "b", name: "B", url: "http://b" },
        ];
        expect(resolveServers(catalog, ["a"])).toEqual([catalog[0]]);
    });

    it("resolves requested servers by name", () => {
        const catalog = [
            { id: "a", name: "A", url: "http://a" },
            { id: "b", name: "B", url: "http://b" },
        ];
        expect(resolveServers(catalog, ["A"])).toEqual([catalog[0]]);
    });

    it("throws for unknown server", () => {
        expect(() => resolveServers([], ["missing"])).toThrow(
            'Unknown MCP server "missing"',
        );
    });
});

describe("clients", () => {
    const tmpDir = join(process.cwd(), ".tmp-test-mcp-clients");
    const ctx = { home: tmpDir, env: {} as NodeJS.ProcessEnv };
    const key = "sk-test-secret";
    const servers = [
        {
            id: "pollinations",
            name: "Pollinations",
            url: "https://gen.pollinations.ai/mcp/pollinations",
        },
        {
            id: "ffmpeg",
            name: "FFmpeg",
            url: "https://gen.pollinations.ai/mcp/ffmpeg",
        },
    ];

    beforeEach(() => {
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("parses codex TOML to find owned servers", () => {
        const toml = `
[mcp_servers.flux]
url = "https://gen.pollinations.ai/mcp/flux"

[mcp_servers.other]
url = "https://example.com/mcp"
`;
        expect(codexInstalledIds(toml)).toEqual(["flux"]);
    });

    it("returns empty for no owned servers", () => {
        const toml = `
[mcp_servers.other]
url = "https://example.com/mcp"
`;
        expect(codexInstalledIds(toml)).toEqual([]);
    });

    it("codex addArgs reference an env var name, never the secret", () => {
        const args = codexAddArgs(servers[0]);
        expect(args).toContain("POLLI_MCP_CODEX_KEY");
        expect(args.join(" ")).not.toContain(key);
    });

    it("prioritizes clients in the quest order", () => {
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

    describe("json clients keep the secret out of process arguments", () => {
        const cases = [
            {
                clientId: "claude-code",
                file: ".claude.json",
                entryPath: ["mcpServers", "pollinations", "headers"],
            },
            {
                clientId: "gemini",
                file: join(".gemini", "settings.json"),
                entryPath: ["mcpServers", "pollinations", "headers"],
            },
            {
                clientId: "amp",
                file: join(".config", "amp", "settings.json"),
                entryPath: ["amp.mcpServers", "pollinations", "headers"],
            },
        ];

        it.each(
            cases,
        )("$clientId install writes the bearer header into its config file", ({
            clientId,
            file,
            entryPath,
        }) => {
            // biome-ignore lint/style/noNonNullAssertion: test fixture guarantees this client exists
            const result = findClient(clientId)!.install(
                ctx,
                [servers[0]],
                key,
            );
            expect(result.installed).toEqual(["pollinations"]);
            const config = readJsonObject(join(tmpDir, file));
            let node: unknown = config;
            for (const part of entryPath) {
                node = (node as Record<string, unknown>)[part];
            }
            expect(node).toEqual({ Authorization: `Bearer ${key}` });
        });

        it("partial remove keeps other owned entries and reports them as installed", () => {
            // biome-ignore lint/style/noNonNullAssertion: test fixture guarantees this client exists
            const client = findClient("claude-code")!;
            client.install(ctx, servers, key);
            const result = client.remove(ctx, ["pollinations"]);
            expect(result.removed).toEqual(["pollinations"]);
            expect(result.installed).toEqual(["ffmpeg"]);
            const config = readJsonObject(join(tmpDir, ".claude.json"));
            const remaining = (config.mcpServers as Record<string, unknown>)
                .ffmpeg as Record<string, unknown>;
            expect(remaining.url).toBe(servers[1].url);
        });

        it("full remove clears all owned entries", () => {
            // biome-ignore lint/style/noNonNullAssertion: test fixture guarantees this client exists
            const client = findClient("gemini")!;
            client.install(ctx, servers, key);
            const result = client.remove(ctx);
            expect(result.removed).toEqual(["pollinations", "ffmpeg"]);
            expect(result.installed).toEqual([]);
        });

        it("VS Code install notes never print the secret", () => {
            // biome-ignore lint/style/noNonNullAssertion: test fixture guarantees this client exists
            const client = findClient("vscode")!;
            const result = client.install(ctx, [servers[0]], key);
            expect(result.notes.join("\n")).not.toContain(key);
        });
    });
});
