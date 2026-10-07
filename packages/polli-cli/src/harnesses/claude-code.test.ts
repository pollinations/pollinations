import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessContext } from "./types.js";

const mocks = vi.hoisted(() => ({
    resolveHarnessKey: vi.fn(
        async (harness: { existingKey: string | null }) =>
            harness.existingKey ?? "sk_child",
    ),
    fetchHarnessModels: vi.fn(async (selected: string) => [
        { id: selected, contextWindow: 128000, input: ["text"] },
    ]),
    keyUsageCount: vi.fn(async () => 4),
    waitForKeyUsageIncrease: vi.fn(async () => 5),
}));

vi.mock("./keys.js", () => ({
    resolveHarnessKey: mocks.resolveHarnessKey,
}));
vi.mock("./models.js", () => ({
    fetchHarnessModels: mocks.fetchHarnessModels,
}));
vi.mock("./usage-proof.js", () => ({
    keyUsageCount: mocks.keyUsageCount,
    waitForKeyUsageIncrease: mocks.waitForKeyUsageIncrease,
}));

import { claudeCode } from "./claude-code.js";

let home: string;
let ctx: HarnessContext;

const settingsFile = () => join(home, ".pollinations", "claude-code.json");
const callsFile = () => join(home, "claude-calls.jsonl");
const calls = () =>
    readFileSync(callsFile(), "utf-8")
        .trim()
        .split("\n")
        .map(
            (line) =>
                JSON.parse(line) as {
                    args: string[];
                    settings: { env: Record<string, string> };
                },
        );

// Records each launch with the settings file it was given, then answers like
// `claude -p` would: pong, or a failure when FAKE_CLAUDE_FAIL is set.
const installFakeClaude = () => {
    const bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
        join(bin, "claude"),
        `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const settings = JSON.parse(readFileSync(args[args.indexOf("--settings") + 1], "utf-8"));
appendFileSync(${JSON.stringify(callsFile())}, JSON.stringify({ args, settings }) + "\\n");
if (process.env.FAKE_CLAUDE_FAIL) {
    console.log("API Error: 401 Invalid API key");
    process.exit(1);
}
console.log("pong");
`,
    );
    chmodSync(join(bin, "claude"), 0o755);
    ctx.env = {
        ...process.env,
        HOME: home,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    };
};

beforeEach(() => {
    mocks.resolveHarnessKey.mockClear();
    mocks.waitForKeyUsageIncrease.mockClear();
    home = mkdtempSync(join(tmpdir(), "polli-claude-harness-"));
    ctx = { home, env: {} };
    installFakeClaude();
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("Claude Code harness", () => {
    it("writes a separate settings file and proves it by running Claude Code", async () => {
        const result = await claudeCode.on(ctx, {});
        const model = "openai/gpt-6-sol";
        expect(result).toMatchObject({
            configured: true,
            model,
            smokeVerified: true,
        });

        const { env } = JSON.parse(readFileSync(settingsFile(), "utf-8"));
        expect(env).toEqual({
            ANTHROPIC_BASE_URL: "https://gen.pollinations.ai",
            ANTHROPIC_AUTH_TOKEN: "sk_child",
            ANTHROPIC_MODEL: model,
            ANTHROPIC_DEFAULT_FABLE_MODEL: model,
            ANTHROPIC_DEFAULT_OPUS_MODEL: model,
            ANTHROPIC_DEFAULT_SONNET_MODEL: model,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
        });
        if (process.platform !== "win32") {
            expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        }
        expect(calls()).toEqual([
            expect.objectContaining({
                args: expect.arrayContaining([
                    "-p",
                    "--settings",
                    settingsFile(),
                ]),
                settings: { env },
            }),
        ]);
        expect(mocks.waitForKeyUsageIncrease).toHaveBeenCalledWith(
            "sk_child",
            4,
            expect.objectContaining({ afterMs: expect.any(Number) }),
        );
        expect(existsSync(join(home, ".claude"))).toBe(false);
    });

    it("reuses the key stored in its settings file", async () => {
        await claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" });
        mocks.resolveHarnessKey.mockClear();
        const result = await claudeCode.on(ctx, {
            model: "openai/gpt-5.4-mini",
        });
        expect(mocks.resolveHarnessKey).toHaveBeenCalledWith(
            expect.objectContaining({ existingKey: "sk_child" }),
            expect.anything(),
        );
        expect(result.model).toBe("openai/gpt-5.4-mini");
    });

    it("stops before login or key creation when Claude Code is missing", async () => {
        const missing = { ...ctx, env: { ...ctx.env, PATH: "" } };
        await expect(claudeCode.on(missing, {})).rejects.toThrow(
            "Claude Code was not found",
        );
        expect(mocks.resolveHarnessKey).not.toHaveBeenCalled();
    });

    it("restores the previous settings when Claude Code cannot run", async () => {
        await claudeCode.on(ctx, { model: "openai/gpt-5.4-nano" });
        const before = readFileSync(settingsFile(), "utf-8");
        ctx.env.FAKE_CLAUDE_FAIL = "1";

        await expect(
            claudeCode.on(ctx, { model: "openai/gpt-5.4-mini" }),
        ).rejects.toThrow("401 Invalid API key");
        expect(readFileSync(settingsFile(), "utf-8")).toBe(before);

        rmSync(settingsFile());
        await expect(claudeCode.on(ctx, {})).rejects.toThrow("smoke test");
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("off removes only its settings file", async () => {
        await claudeCode.on(ctx, {});
        expect(claudeCode.status(ctx)).toMatchObject({ configured: true });

        expect(await claudeCode.off(ctx)).toMatchObject({
            configured: false,
            outcome: "stripped",
        });
        expect(existsSync(settingsFile())).toBe(false);
        expect(existsSync(join(home, ".pollinations"))).toBe(true);
        expect(await claudeCode.off(ctx)).toMatchObject({
            outcome: "unchanged",
        });
    });
});
