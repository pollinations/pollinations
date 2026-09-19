import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    bearerFromEntry,
    isOwnedEntry,
    ownedEntryNames,
    readCodexServers,
    readEnvValue,
    readJsonFile,
    readNestedTable,
    removeEnvValue,
    runCli,
    writeEnvValue,
    writeJsonFile,
} from "./config.js";

let home: string;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-mcp-config-"));
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("ownership", () => {
    it("recognises every URL field a client may use", () => {
        expect(
            isOwnedEntry({ url: "https://gen.pollinations.ai/mcp/exa" }),
        ).toBe(true);
        expect(
            isOwnedEntry({ serverUrl: "https://gen.pollinations.ai/mcp/exa" }),
        ).toBe(true);
        expect(
            isOwnedEntry({ httpUrl: "https://gen.pollinations.ai/mcp/exa" }),
        ).toBe(true);
        expect(isOwnedEntry({ url: "https://example.com/mcp/exa" })).toBe(
            false,
        );
        expect(isOwnedEntry({ command: "npx" })).toBe(false);
        expect(isOwnedEntry(null)).toBe(false);
    });

    it("recognises a server reached through a bridge command", () => {
        expect(
            isOwnedEntry({
                command: "npx",
                args: [
                    "-y",
                    "mcp-remote",
                    "https://gen.pollinations.ai/mcp/exa",
                ],
            }),
        ).toBe(true);
    });

    it("lists only the owned entries of a table", () => {
        expect(
            ownedEntryNames({
                pollinations: {
                    url: "https://gen.pollinations.ai/mcp/pollinations",
                },
                mine: { url: "https://example.com/mcp" },
            }),
        ).toEqual(["pollinations"]);
    });

    it("reads a bearer token from headers, case-insensitively", () => {
        expect(
            bearerFromEntry({ headers: { authorization: "Bearer sk_test" } }),
        ).toBe("sk_test");
        expect(
            bearerFromEntry({
                http_headers: { Authorization: "Bearer sk_other" },
            }),
        ).toBe("sk_other");
        expect(bearerFromEntry({ headers: { Authorization: "none" } })).toBe(
            null,
        );
        expect(bearerFromEntry({})).toBe(null);
    });
});

describe("readJsonFile / writeJsonFile", () => {
    it("reads a missing file as an empty object", () => {
        expect(readJsonFile(join(home, "missing.json"))).toMatchObject({
            data: {},
            jsonc: false,
        });
    });

    it("accepts comments and marks the file as JSONC", () => {
        const path = join(home, "settings.json");
        writeFileSync(path, '{\n  // a comment\n  "theme": "dark",\n}\n');
        const file = readJsonFile(path);
        expect(file.jsonc).toBe(true);
        expect(file.data).toEqual({ theme: "dark" });
    });

    it("leaves a broken file untouched and explains why", () => {
        const path = join(home, "broken.json");
        writeFileSync(path, "{ not json");
        expect(() => readJsonFile(path)).toThrow(/left untouched/);
    });

    it("writes a newline-terminated object with the given mode", () => {
        const path = join(home, "nested", "mcp.json");
        writeJsonFile(path, { mcpServers: {} });
        expect(readJsonFile(path).data).toEqual({ mcpServers: {} });
    });

    const mode = (path: string) => statSync(path).mode & 0o777;

    it("tightens a config that already exists and carries the key", () => {
        const path = join(home, ".cursor", "mcp.json");
        mkdirSync(join(home, ".cursor"), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify({
                mcpServers: { mine: { url: "https://example.com" } },
            }),
            { mode: 0o644 },
        );
        chmodSync(path, 0o644);
        writeJsonFile(path, {
            mcpServers: {
                pollinations: {
                    url: "https://gen.pollinations.ai/mcp/pollinations",
                    headers: { Authorization: "Bearer sk_test" },
                },
            },
        });
        expect(mode(path)).toBe(0o600);
    });

    it("leaves a config without a literal key at its own mode", () => {
        const path = join(home, "vscode", "mcp.json");
        mkdirSync(join(home, "vscode"), { recursive: true });
        writeFileSync(path, '{"mcpServers":{}}', { mode: 0o644 });
        chmodSync(path, 0o644);
        writeJsonFile(path, {
            inputs: [{ type: "promptString", id: "pollinations-mcp-key" }],
            mcpServers: {
                pollinations: {
                    url: "https://gen.pollinations.ai/mcp/pollinations",
                    headers: {
                        Authorization: `Bearer \${input:pollinations-mcp-key}`,
                    },
                },
            },
        });
        expect(mode(path)).toBe(0o644);
    });

    it("reads nested tables", () => {
        expect(
            readNestedTable(
                { amp: { mcpServers: { pollinations: { url: "u" } } } },
                ["amp", "mcpServers"],
            ),
        ).toEqual({ pollinations: { url: "u" } });
        expect(readNestedTable({}, ["amp", "mcpServers"])).toEqual({});
    });
});

describe("env files", () => {
    it("adds a variable and keeps the existing lines", () => {
        const path = join(home, ".codex", ".env");
        writeEnvValue(path, "OTHER", "keep");
        expect(writeEnvValue(path, "POLLI_MCP_CODEX_API_KEY", "sk_test")).toBe(
            true,
        );
        expect(readEnvValue(path, "POLLI_MCP_CODEX_API_KEY")).toBe("sk_test");
        expect(readEnvValue(path, "OTHER")).toBe("keep");
    });

    it("does not rewrite an unchanged variable", () => {
        const path = join(home, ".env");
        writeEnvValue(path, "A", "1");
        expect(writeEnvValue(path, "A", "1")).toBe(false);
        expect(writeEnvValue(path, "A", "2")).toBe(true);
        expect(readEnvValue(path, "A")).toBe("2");
    });

    it("keeps an env file that already existed owner-only", () => {
        const path = join(home, ".codex", ".env");
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(path, "OTHER=keep\n", { mode: 0o644 });
        chmodSync(path, 0o644);
        writeEnvValue(path, "POLLI_MCP_CODEX_API_KEY", "sk_test");
        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(readEnvValue(path, "OTHER")).toBe("keep");
    });

    it("removes a variable and deletes the file it emptied", () => {
        const path = join(home, ".env");
        writeEnvValue(path, "A", "1");
        writeEnvValue(path, "B", "2");
        expect(removeEnvValue(path, "A")).toBe(true);
        expect(readEnvValue(path, "A")).toBe(null);
        expect(readEnvValue(path, "B")).toBe("2");
        expect(removeEnvValue(path, "B")).toBe(true);
        expect(readEnvValue(path, "B")).toBe(null);
        expect(readEnvValue(path, "missing")).toBe(null);
    });
});

describe("readCodexServers", () => {
    it("reads url and env var from each table, ignoring other config", () => {
        const servers = readCodexServers(
            [
                'model = "gpt"',
                "",
                "[mcp_servers.pollinations]",
                'url = "https://gen.pollinations.ai/mcp/pollinations"',
                'bearer_token_env_var = "POLLI_MCP_CODEX_API_KEY"',
                "",
                '[mcp_servers."exa search"]',
                'url = "https://gen.pollinations.ai/mcp/exa"',
                "",
                "[mcp_servers.mine]",
                'url = "https://example.com/mcp"',
            ].join("\n"),
        );
        expect(servers.pollinations).toEqual({
            url: "https://gen.pollinations.ai/mcp/pollinations",
            bearer_token_env_var: "POLLI_MCP_CODEX_API_KEY",
        });
        expect(servers["exa search"].url).toBe(
            "https://gen.pollinations.ai/mcp/exa",
        );
        expect(servers.mine.url).toBe("https://example.com/mcp");
    });
});

describe("runCli", () => {
    const script = (name: string, body: string) => {
        mkdirSync(join(home, name), { recursive: true });
        const path = join(home, name, "cli.sh");
        writeFileSync(path, `#!/bin/sh\n${body}\n`);
        chmodSync(path, 0o755);
        return path;
    };

    it("returns stdout on success", () => {
        const path = script("ok", 'echo "done"');
        expect(runCli(path, [], { env: {} })).toBe("done\n");
    });

    it("redacts a secret from a failure message", () => {
        const path = script("fail", 'echo "cannot use sk_secret" 1>&2; exit 3');
        expect(() =>
            runCli(path, ["--header", "Bearer sk_secret"], {
                env: {},
                secrets: ["sk_secret"],
            }),
        ).toThrow(/<redacted>/);
        try {
            runCli(path, [], { env: {}, secrets: ["sk_secret"] });
        } catch (error) {
            expect((error as Error).message).not.toContain("sk_secret");
        }
    });

    it("reports a command that cannot start", () => {
        expect(() =>
            runCli(join(home, "missing-cli"), [], { env: {} }),
        ).toThrow(/could not be run/);
    });
});
