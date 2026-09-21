import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_URL } from "../lib/config.js";
import {
    isOwnedEntry,
    ownedEntryNames,
    recoverKeyFromTable,
    upsertEnvFile,
} from "./config-files.js";

describe("isOwnedEntry", () => {
    it("recognizes url, serverUrl, and httpUrl pointing at /mcp/", () => {
        for (const field of ["url", "serverUrl", "httpUrl"]) {
            expect(isOwnedEntry({ [field]: `${BASE_URL}/mcp/ffmpeg` })).toBe(
                true,
            );
        }
    });

    it("recognizes mcp-remote bridge args (Zed)", () => {
        expect(
            isOwnedEntry({
                command: {
                    path: "npx",
                    args: ["mcp-remote", `${BASE_URL}/mcp/ffmpeg`],
                },
            }),
        ).toBe(true);
    });

    it("rejects foreign entries and primitives", () => {
        expect(isOwnedEntry({ url: "https://mcp.notion.com/mcp" })).toBe(false);
        expect(isOwnedEntry({ serverUrl: "https://elsewhere.example/x" })).toBe(
            false,
        );
        expect(isOwnedEntry(null)).toBe(false);
        expect(isOwnedEntry("string")).toBe(false);
    });
});

describe("ownedEntryNames", () => {
    it("returns only Pollinations-owned entry names", () => {
        const table = {
            pollinations: { url: `${BASE_URL}/mcp/pollinations` },
            notion: { url: "https://mcp.notion.com/mcp" },
            ffmpeg: { serverUrl: `${BASE_URL}/mcp/ffmpeg` },
        };
        expect(ownedEntryNames(table).sort()).toEqual([
            "ffmpeg",
            "pollinations",
        ]);
    });

    it("returns empty for a missing or non-object table", () => {
        expect(ownedEntryNames(undefined)).toEqual([]);
        expect(ownedEntryNames("nope")).toEqual([]);
    });
});

describe("recoverKeyFromTable", () => {
    it("recovers the bearer key from owned entry headers", () => {
        const table = {
            pollinations: {
                url: `${BASE_URL}/mcp/pollinations`,
                headers: { Authorization: "Bearer sk-secret" },
            },
        };
        expect(recoverKeyFromTable(table)).toBe("sk-secret");
    });

    it("recovers the key from mcp-remote bridge args", () => {
        const table = {
            zed: {
                command: {
                    path: "npx",
                    args: [
                        "mcp-remote",
                        `${BASE_URL}/mcp/ffmpeg`,
                        "--header",
                        "Authorization: Bearer sk-bridge",
                    ],
                },
            },
        };
        expect(recoverKeyFromTable(table)).toBe("sk-bridge");
    });

    it("ignores foreign entries and input references", () => {
        expect(
            recoverKeyFromTable({
                notion: {
                    url: "https://mcp.notion.com/mcp",
                    headers: { Authorization: "Bearer sk-foreign" },
                },
            }),
        ).toBeNull();
        expect(
            recoverKeyFromTable({
                pollinations: {
                    url: `${BASE_URL}/mcp/pollinations`,
                    headers: { Authorization: `Bearer \${input:key}` },
                },
            }),
        ).toBeNull();
    });
});

describe("upsertEnvFile", () => {
    it("adds a key and preserves other non-empty lines", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-env-"));
        const file = join(dir, ".env");
        upsertEnvFile(file, { POLLI_MCP_CODEX_API_KEY: "sk-a" });
        expect(readFileSync(file, "utf-8")).toBe(
            "POLLI_MCP_CODEX_API_KEY=sk-a\n",
        );

        // A second call replaces the existing value instead of duplicating it.
        upsertEnvFile(file, { POLLI_MCP_CODEX_API_KEY: "sk-b" });
        expect(readFileSync(file, "utf-8")).toBe(
            "POLLI_MCP_CODEX_API_KEY=sk-b\n",
        );
    });

    it("replaces the key line and drops blank lines", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-env-"));
        const file = join(dir, ".env");
        upsertEnvFile(file, { A: "1", B: "2" });
        upsertEnvFile(file, { A: "3" });
        const text = readFileSync(file, "utf-8");
        expect(text).toContain("A=3\n");
        expect(text).toContain("B=2\n");
        expect(text).not.toContain("A=1");
    });
});
