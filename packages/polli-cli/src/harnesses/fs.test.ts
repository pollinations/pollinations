import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHomePath } from "./fs.js";

describe("harness home paths", () => {
    const home = resolve("test-home");

    it.each([
        ["~", home],
        ["~/agent", join(home, "agent")],
        ["~\\agent", join(home, "agent")],
        ["~/agent/../config", join(home, "config")],
        ["agent", resolve("agent")],
        [home, home],
        ["~other/agent", resolve("~other/agent")],
        [" ~/agent ", resolve(" ~/agent ")],
    ])("resolves %s without changing caller whitespace rules", (path, expected) => {
        expect(resolveHomePath(home, path)).toBe(expected);
    });
});

describe("command resolution", () => {
    it("resolves a command with extension on Windows", async () => {
        const { mkdtempSync, rmSync, writeFileSync, chmodSync } = await import(
            "node:fs"
        );
        const { tmpdir } = await import("node:os");
        const dir = mkdtempSync(join(tmpdir(), "polli-fs-test-"));
        const cmdPath = join(dir, "mycmd.cmd");
        writeFileSync(cmdPath, "@echo off\r\n");
        chmodSync(cmdPath, 0o755);

        const originalPlatform = process.platform;
        Object.defineProperty(process, "platform", {
            configurable: true,
            value: "win32",
        });

        try {
            const { resolveCommand, commandExists } = await import("./fs.js");
            expect(
                resolveCommand("mycmd", {
                    PATH: dir,
                    PATHEXT: ".cmd;.bat;.exe",
                }),
            ).toBe(cmdPath);
            expect(
                commandExists("mycmd", {
                    PATH: dir,
                    PATHEXT: ".cmd;.bat;.exe",
                }),
            ).toBe(true);
            expect(
                resolveCommand("missing", {
                    PATH: dir,
                    PATHEXT: ".cmd;.bat;.exe",
                }),
            ).toBeNull();
            expect(
                commandExists("missing", {
                    PATH: dir,
                    PATHEXT: ".cmd;.bat;.exe",
                }),
            ).toBe(false);
        } finally {
            Object.defineProperty(process, "platform", {
                configurable: true,
                value: originalPlatform,
            });
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
