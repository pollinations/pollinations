import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { detectInstallKind, readVersion } from "./update.js";

describe("detectInstallKind", () => {
    const globalRoot = resolve("/usr/local/lib/node_modules");

    it("recognizes a global install directly under npm root -g", () => {
        expect(
            detectInstallKind(join(globalRoot, "@pollinations", "cli"), globalRoot),
        ).toBe("global");
    });

    it("recognizes npx caches regardless of npm root", () => {
        const dir = join(
            tmpdir(),
            "_npx",
            "abc123",
            "node_modules",
            "@pollinations",
            "cli",
        );
        expect(detectInstallKind(dir, globalRoot)).toBe("npx");
    });

    it("treats project deps and linked checkouts as local", () => {
        expect(detectInstallKind(resolve("/repo/packages/polli-cli"), globalRoot)).toBe(
            "local",
        );
    });

    it("falls back to local when npm root -g is unavailable", () => {
        expect(
            detectInstallKind(join(globalRoot, "@pollinations", "cli"), null),
        ).toBe("local");
    });

    it("is unaffected by trailing separators", () => {
        const dir = `${join(globalRoot, "@pollinations", "cli")}${sep}`;
        expect(detectInstallKind(dir, globalRoot)).toBe("global");
    });
});

describe("readVersion", () => {
    it("reads the version from a package.json", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-update-"));
        writeFileSync(
            join(dir, "package.json"),
            JSON.stringify({ name: "x", version: "1.2.3" }),
        );
        expect(readVersion(dir)).toBe("1.2.3");
    });

    it("returns unknown when there is no package.json", () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-update-"));
        expect(readVersion(join(dir, "missing"))).toBe("unknown");
    });
});
