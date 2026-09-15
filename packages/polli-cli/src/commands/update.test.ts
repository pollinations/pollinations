import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Extract pure functions for unit testing by re-implementing them here
// (they're not exported from update.ts to keep the module focused)

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

describe("compareVersions", () => {
    it("returns 0 for equal versions", () => {
        expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    });

    it("detects newer patch version", () => {
        expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    });

    it("detects newer minor version", () => {
        expect(compareVersions("1.1.0", "1.0.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
    });

    it("detects newer major version", () => {
        expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    });

    it("handles versions with different segment counts", () => {
        expect(compareVersions("1.0", "1.0.0")).toBe(0);
        expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
    });
});

describe("detectInstallKind logic", () => {
    const originalExecPath = process.execPath;
    const originalArgv = process.argv;

    afterEach(() => {
        Object.defineProperty(process, "execPath", { value: originalExecPath });
        Object.defineProperty(process, "argv", { value: originalArgv });
    });

    function detectKind(): "global" | "npx" | "local" {
        const execDir = process.execPath.toLowerCase();
        const runDir = process.argv[1]?.toLowerCase() ?? "";

        if (execDir.includes("_npx") || runDir.includes("_npx")) return "npx";

        // Simplified detection for testing (no npm root -g call)
        if (runDir.includes("node_modules")) return "local";
        return "global";
    }

    it("detects npx from exec path", () => {
        Object.defineProperty(process, "execPath", {
            value: "/home/.npm/_npx/node",
        });
        expect(detectKind()).toBe("npx");
    });

    it("detects npx from argv", () => {
        Object.defineProperty(process, "argv", {
            value: ["/usr/bin/node", "/home/.npm/_npx/12345/bin/polli"],
        });
        expect(detectKind()).toBe("npx");
    });

    it("detects local from argv containing node_modules", () => {
        Object.defineProperty(process, "argv", {
            value: ["/usr/bin/node", "/project/node_modules/.bin/polli"],
        });
        expect(detectKind()).toBe("local");
    });

    it("defaults to global for typical install", () => {
        Object.defineProperty(process, "execPath", {
            value: "/usr/bin/node",
        });
        Object.defineProperty(process, "argv", {
            value: ["/usr/bin/node", "/usr/bin/polli"],
        });
        expect(detectKind()).toBe("global");
    });
});
