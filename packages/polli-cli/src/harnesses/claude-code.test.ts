import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    claudeCode,
    claudeCodeRouterConfigDir,
    configureClaudeCode,
    disableClaudeCode,
} from "./claude-code.js";
import type { HarnessContext } from "./types.js";

// node:sqlite needs Node 22.5+ (and still `--experimental-sqlite` on some
// builds); skip the suite that exercises it rather than failing to collect
// the whole file on a Node that lacks it.
let DatabaseSync: typeof import("node:sqlite").DatabaseSync | undefined;
try {
    ({ DatabaseSync } = await import("node:sqlite"));
} catch {
    DatabaseSync = undefined;
}

const models = [
    { id: "anthropic/claude-sonnet-5", contextWindow: 200000, input: ["text"] },
];
const settings = {
    apiKey: "sk_test_key",
    model: "anthropic/claude-sonnet-5",
    models,
};

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-claude-code-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const dbFile = () => join(home, ".claude-code-router", "config.sqlite");
const openDb = (path: string) => {
    if (!DatabaseSync) throw new Error("node:sqlite unavailable");
    return new DatabaseSync(path);
};

const readRow = (): Record<string, unknown> | undefined => {
    if (!existsSync(dbFile())) return undefined;
    const db = openDb(dbFile());
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = ?")
            .get("default") as { value_json: string } | undefined;
        return row ? JSON.parse(row.value_json) : undefined;
    } finally {
        db.close();
    }
};

const writeRow = (config: Record<string, unknown>) => {
    mkdirSync(join(home, ".claude-code-router"), { recursive: true });
    const db = openDb(dbFile());
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `);
        db.prepare(
            `INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        ).run("default", JSON.stringify(config), new Date().toISOString());
    } finally {
        db.close();
    }
};

describe.skipIf(!DatabaseSync)("claude-code harness", () => {
    it("creates a fresh config with the Pollinations provider and model", async () => {
        const result = await configureClaudeCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "claude-code",
            configured: true,
            model: "anthropic/claude-sonnet-5",
        });

        const config = readRow();
        const provider = (config?.Providers as Record<string, unknown>[]).find(
            (p) => p.id === "pollinations",
        ) as Record<string, unknown>;
        expect(provider).toMatchObject({
            name: "Pollinations.ai",
            api_base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_test_key",
            type: "openai_chat_completions",
            models: ["anthropic/claude-sonnet-5"],
        });
        expect(
            (config?.profile as Record<string, unknown>).claudeCode,
        ).toMatchObject({ model: "Pollinations.ai/anthropic/claude-sonnet-5" });

        expect(await claudeCode.status(ctx)).toMatchObject({
            configured: true,
            model: "anthropic/claude-sonnet-5",
        });
    });

    it("keeps existing providers and profile settings", async () => {
        writeRow({
            Providers: [
                {
                    id: "openrouter",
                    name: "OpenRouter",
                    api_base_url: "https://openrouter.ai/api/v1",
                    models: ["x"],
                },
            ],
            profile: {
                claudeCode: { enabled: true, model: "OpenRouter/x" },
                codex: { enabled: true },
            },
            HOST: "127.0.0.1",
            PORT: 3456,
        });

        await configureClaudeCode(ctx, settings);

        const config = readRow();
        const providers = config?.Providers as Record<string, unknown>[];
        expect(providers.map((p) => p.id).sort()).toEqual([
            "openrouter",
            "pollinations",
        ]);
        expect((config?.profile as Record<string, unknown>).codex).toEqual({
            enabled: true,
        });
        expect(config?.PORT).toBe(3456);
    });

    it("restores the row byte-for-byte on off", async () => {
        writeRow({
            Providers: [],
            profile: { claudeCode: { enabled: true, model: "" } },
        });
        const before = readRow();

        await configureClaudeCode(ctx, settings);
        const result = await disableClaudeCode(ctx);

        expect(result.outcome).toBe("restored");
        expect(readRow()).toEqual(before);
        expect((await claudeCode.status(ctx)).configured).toBe(false);
    });

    it("deletes the row on off when it created it from nothing", async () => {
        await configureClaudeCode(ctx, settings);
        const result = await disableClaudeCode(ctx);
        expect(result.outcome).toBe("restored");
        expect(readRow()).toBeUndefined();
    });

    it("strips only the Pollinations entries when the row changed since on", async () => {
        await configureClaudeCode(ctx, settings);

        const config = readRow();
        (config?.Providers as Record<string, unknown>[]).push({
            id: "openrouter",
            name: "OpenRouter",
        });
        writeRow(config as Record<string, unknown>);

        const result = await disableClaudeCode(ctx);
        expect(result.outcome).toBe("stripped");

        const remaining = readRow();
        const providers = remaining?.Providers as Record<string, unknown>[];
        expect(providers.map((p) => p.id)).toEqual(["openrouter"]);
        expect(
            (remaining?.profile as Record<string, unknown>).claudeCode,
        ).toMatchObject({ model: "" });
    });

    it("reports unchanged when off runs before on", async () => {
        expect((await disableClaudeCode(ctx)).outcome).toBe("unchanged");
    });

    it("does not create config.sqlite for a status check before on", async () => {
        expect((await claudeCode.status(ctx)).configured).toBe(false);
        expect(existsSync(dbFile())).toBe(false);
    });

    it("re-running on switches the model", async () => {
        await configureClaudeCode(ctx, settings);
        await configureClaudeCode(ctx, {
            ...settings,
            model: "openai/gpt-5.4-nano",
        });
        expect((await claudeCode.status(ctx)).model).toBe(
            "openai/gpt-5.4-nano",
        );
    });

    it("reports unconfigured when the provider is missing its key", async () => {
        await configureClaudeCode(ctx, settings);
        const config = readRow();
        const provider = (config?.Providers as Record<string, unknown>[])[0];
        delete provider.api_key;
        writeRow(config as Record<string, unknown>);
        expect((await claudeCode.status(ctx)).configured).toBe(false);
    });

    it("honors a Windows APPDATA config dir", () => {
        const platform = Object.getOwnPropertyDescriptor(process, "platform");
        Object.defineProperty(process, "platform", { value: "win32" });
        try {
            const dir = claudeCodeRouterConfigDir({
                home,
                env: { APPDATA: join(home, "AppData", "Roaming") },
            });
            expect(dir).toBe(
                join(home, "AppData", "Roaming", "claude-code-router"),
            );
        } finally {
            if (platform) Object.defineProperty(process, "platform", platform);
        }
    });

    it("stops before configuration when Claude Code is unavailable", async () => {
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code was not found",
        );
        expect(existsSync(dbFile())).toBe(false);
    });

    it("stops before configuration when Claude Code Router is unavailable", async () => {
        const binDir = join(home, "bin");
        mkdirSync(binDir, { recursive: true });
        writeFileSync(join(binDir, "claude"), "#!/bin/sh\nexit 0\n");
        chmodSync(join(binDir, "claude"), 0o755);
        ctx.env = {
            ...process.env,
            HOME: home,
            PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        };
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code Router was not found",
        );
        expect(existsSync(dbFile())).toBe(false);
    });
});
