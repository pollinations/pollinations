import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { detectInstallKind } from "./update.js";

describe("detectInstallKind", () => {
    it("recognizes a global install directly under npm root -g", () => {
        const globalRoot = resolve("/usr/local/lib/node_modules");
        const dir = join(globalRoot, "@pollinations", "cli");
        expect(detectInstallKind(dir, globalRoot)).toBe("global");
    });

    it("recognizes npx's cache path regardless of npm root", () => {
        const dir = resolve(
            `/home/user/.npm/_npx/abc123/node_modules/@pollinations/cli`,
        );
        expect(
            detectInstallKind(dir, resolve("/usr/local/lib/node_modules")),
        ).toBe("npx");
    });

    it("falls back to local for project deps and linked dev checkouts", () => {
        const dir = resolve("/repo/packages/polli-cli");
        expect(
            detectInstallKind(dir, resolve("/usr/local/lib/node_modules")),
        ).toBe("local");
    });

    it("falls back to local when npm root -g could not be resolved", () => {
        const dir = resolve("/usr/local/lib/node_modules/@pollinations/cli");
        expect(detectInstallKind(dir, null)).toBe("local");
    });

    it("is unaffected by trailing separators", () => {
        const globalRoot = resolve("/usr/local/lib/node_modules");
        const dir = `${join(globalRoot, "@pollinations", "cli")}${sep}`;
        expect(detectInstallKind(dir, globalRoot)).toBe("global");
    });
});
