import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    isOwnedEntry,
    ownedEntryNames,
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

describe("read/writeJsonObject", () => {
    it("round-trips and treats missing files as empty objects", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-mcp-"));
        const file = join(dir, "sub", "config.json");
        expect(readJsonObject(file)).toEqual({});
        writeJsonObject(file, { a: 1 });
        expect(readJsonObject(file)).toEqual({ a: 1 });
    });
});

describe("upsertEnvFile", () => {
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
});
