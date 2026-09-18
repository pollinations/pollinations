import { chmodSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    firstOwnedKey,
    isOwnedEntry,
    ownedEntryKey,
    ownedEntryNames,
    readEnvValue,
    readJsonObject,
    upsertEnvFile,
    writeJsonObject,
} from "./config-files.js";

const BASE = "https://gen.pollinations.ai";

describe("isOwnedEntry", () => {
    it("recognizes url, serverUrl and httpUrl fields", () => {
        expect(isOwnedEntry({ url: `${BASE}/mcp/pollinations` }, BASE)).toBe(
            true,
        );
        expect(isOwnedEntry({ serverUrl: `${BASE}/mcp/ffmpeg` }, BASE)).toBe(
            true,
        );
        expect(isOwnedEntry({ httpUrl: `${BASE}/mcp/exa` }, BASE)).toBe(true);
    });

    it("recognizes mcp-remote bridge entries (args and command.args)", () => {
        expect(
            isOwnedEntry(
                {
                    command: {
                        path: "npx",
                        args: ["mcp-remote", `${BASE}/mcp/pollinations`],
                    },
                },
                BASE,
            ),
        ).toBe(true);
        expect(
            isOwnedEntry(
                { command: "npx", args: ["mcp-remote", `${BASE}/mcp/ffmpeg`] },
                BASE,
            ),
        ).toBe(true);
    });

    it("leaves foreign entries alone", () => {
        expect(isOwnedEntry({ url: "https://mcp.notion.com/mcp" }, BASE)).toBe(
            false,
        );
        expect(isOwnedEntry({ command: "npx", args: ["server"] }, BASE)).toBe(
            false,
        );
        expect(isOwnedEntry("nonsense", BASE)).toBe(false);
        expect(isOwnedEntry(undefined, BASE)).toBe(false);
    });
});

describe("ownedEntryNames", () => {
    it("lists only owned entries of a table", () => {
        expect(
            ownedEntryNames(
                {
                    pollinations: { url: `${BASE}/mcp/pollinations` },
                    notion: { url: "https://mcp.notion.com/mcp" },
                },
                BASE,
            ),
        ).toEqual(["pollinations"]);
        expect(ownedEntryNames(undefined, BASE)).toEqual([]);
    });
});

describe("ownedEntryKey / firstOwnedKey", () => {
    it("recovers a literal bearer key from a headers entry", () => {
        expect(
            ownedEntryKey({
                url: `${BASE}/mcp/pollinations`,
                headers: { Authorization: "Bearer sk_abc123" },
            }),
        ).toBe("sk_abc123");
    });

    it("recovers a bearer key from mcp-remote bridge args", () => {
        expect(
            ownedEntryKey({
                command: {
                    path: "npx",
                    args: [
                        "-y",
                        "mcp-remote@latest",
                        `${BASE}/mcp/ffmpeg`,
                        "--header",
                        "Authorization: Bearer sk_bridge",
                    ],
                },
            }),
        ).toBe("sk_bridge");
    });

    it("never treats VS Code's input placeholder as a literal key", () => {
        expect(
            ownedEntryKey({
                url: `${BASE}/mcp/pollinations`,
                headers: {
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal VS Code placeholder syntax, not an interpolation bug
                    Authorization: "Bearer ${input:pollinations-mcp-key}",
                },
            }),
        ).toBeNull();
    });

    it("returns null when nothing is recoverable", () => {
        expect(ownedEntryKey({ url: `${BASE}/mcp/pollinations` })).toBeNull();
        expect(ownedEntryKey(undefined)).toBeNull();
    });

    it("firstOwnedKey skips foreign entries and returns the first owned key", () => {
        const table = {
            notion: {
                url: "https://mcp.notion.com/mcp",
                headers: { Authorization: "Bearer notion_key" },
            },
            pollinations: {
                url: `${BASE}/mcp/pollinations`,
                headers: { Authorization: "Bearer sk_real" },
            },
        };
        expect(firstOwnedKey(table, BASE)).toBe("sk_real");
        expect(firstOwnedKey(undefined, BASE)).toBeNull();
    });
});

describe("read/writeJsonObject", () => {
    it("round-trips and treats missing files as empty objects", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-"));
        const file = join(dir, "sub", "config.json");
        expect(readJsonObject(file)).toEqual({});
        writeJsonObject(file, { a: 1 });
        expect(readJsonObject(file)).toEqual({ a: 1 });
    });
});

describe("secret file permissions", () => {
    it("writes owner-only even when the config already exists as 0644", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-"));
        const jsonFile = join(dir, "mcp.json");
        writeJsonObject(jsonFile, {});
        chmodSync(jsonFile, 0o644);
        writeJsonObject(jsonFile, { mcpServers: {} });
        expect(statSync(jsonFile).mode & 0o777).toBe(0o600);

        const envFile = join(dir, ".env");
        upsertEnvFile(envFile, { A: "1" });
        chmodSync(envFile, 0o644);
        upsertEnvFile(envFile, { A: "2" });
        expect(statSync(envFile).mode & 0o777).toBe(0o600);
    });
});

describe("upsertEnvFile / readEnvValue", () => {
    it("adds and replaces KEY=value lines without touching others", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-"));
        const file = join(dir, ".env");
        upsertEnvFile(file, { POLLI_KEY: "one" });
        upsertEnvFile(file, { POLLI_KEY: "two", OTHER: "x" });
        const text = readFileSync(file, "utf-8");
        expect(text).toContain("POLLI_KEY=two");
        expect(text).toContain("OTHER=x");
        expect(text).not.toContain("POLLI_KEY=one");
    });

    it("reads a value back out, or null when missing", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-"));
        const file = join(dir, ".env");
        upsertEnvFile(file, { POLLI_MCP_CODEX_API_KEY: "sk_codex" });
        expect(readEnvValue(file, "POLLI_MCP_CODEX_API_KEY")).toBe("sk_codex");
        expect(readEnvValue(file, "MISSING")).toBeNull();
        expect(readEnvValue(join(dir, "nope.env"), "X")).toBeNull();
    });
});
