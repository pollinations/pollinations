import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installHarness, needsInstall } from "./engine.js";
import type { HarnessContext, HarnessProfile } from "./types.js";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: { ...process.env, HOME: home } };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const fake = (command: string): HarnessProfile => ({
    id: "fake",
    label: "Fake Harness",
    docsUrl: "https://example.com",
    defaultModel: "deepseek",
    restartHint: "",
    files: () => [],
    readKey: () => null,
    enable: () => {},
    disable: () => false,
    status: () => ({ configured: false }),
    install: {
        installed: (c) => existsSync(join(c.home, "installed")),
        command,
    },
});

describe("harness install", () => {
    it("runs the official installer only when the harness is missing", () => {
        const profile = fake('touch "$HOME/installed"');
        expect(needsInstall(profile, ctx)).toBe(true);
        installHarness(profile, ctx);
        expect(needsInstall(profile, ctx)).toBe(false);
    });

    it("fails when the installer exits non-zero", () => {
        expect(() => installHarness(fake("exit 3"), ctx)).toThrow(
            "installer exited with 3",
        );
    });

    it("has nothing to install for harnesses without an install step", () => {
        const profile = { ...fake(""), install: undefined };
        expect(needsInstall(profile, ctx)).toBe(false);
    });
});
