import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    claudeCode,
    claudeCodeRouterDir,
    configureClaudeCodeRouter,
    disableClaudeCodeRouter,
} from "./claude-code-router.js";
import type { HarnessContext } from "./types.js";

vi.mock("./keys.js", () => ({
    resolveHarnessKey: vi.fn(async () => "sk_test_key"),
}));

vi.mock("./models.js", () => ({
    fetchHarnessModels: vi.fn(async (model: string) => [
        { id: model, contextWindow: 128_000, input: ["text"] },
        { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
    ]),
}));

let home: string;
let ctx: HarnessContext;

const configPath = () => join(claudeCodeRouterDir(ctx), "config.sqlite");
const snapshotDir = () => join(home, ".pollinations", "harnesses");

const readConfig = () => {
    const db = new DatabaseSync(configPath(), { readOnly: true });
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = ? LIMIT 1")
            .get("default") as { value_json: string };
        return JSON.parse(row.value_json);
    } finally {
        db.close();
    }
};

const baseConfig = () => ({
    APIKEY: "",
    Providers: [
        {
            name: "OpenRouter",
            api_base_url: "https://openrouter.ai/api/v1",
            api_key: "sk-openrouter",
            type: "openai_chat_completions",
            models: ["anthropic/claude-sonnet-4"],
            enabled: true,
        },
    ],
    profile: {
        enabled: true,
        profiles: [
            {
                agent: "claude-code",
                enabled: true,
                id: "default-claude-code",
                model: "",
                name: "Claude Code",
                scope: "global",
                settingsFile: "~/.claude/settings.json",
                surface: "auto",
            },
            {
                agent: "codex",
                enabled: true,
                id: "default-codex",
                model: "",
                name: "Codex",
            },
        ],
    },
});

const writeConfig = (config: unknown) => {
    const db = new DatabaseSync(configPath());
    try {
        db.prepare(
            "INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?) " +
                "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        ).run("default", JSON.stringify(config), new Date().toISOString());
    } finally {
        db.close();
    }
};

const createDatabase = (config: unknown) => {
    mkdirSync(claudeCodeRouterDir(ctx), { recursive: true });
    const db = new DatabaseSync(configPath());
    try {
        db.exec(
            "CREATE TABLE app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
        );
    } finally {
        db.close();
    }
    writeConfig(config);
};

const installFakeClient = () => {
    const bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    for (const name of ["ccr", "claude"]) {
        writeFileSync(join(bin, name), "#!/bin/sh\n");
        chmodSync(join(bin, name), 0o755);
    }
};

const snapshotFiles = () =>
    existsSync(snapshotDir())
        ? readdirSync(snapshotDir()).filter((name) =>
              name.startsWith("claude-code."),
          )
        : [];

const setup = (env: NodeJS.ProcessEnv = {}) => {
    ctx = { home, env };
    return ctx;
};

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    installFakeClient();
    ctx = setup({
        CCR_INTERNAL_HOME_DIR: home,
        PATH: join(home, "bin"),
    });
    createDatabase(baseConfig());
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
});

describe("claude code harness", () => {
    it("keeps every snapshot artefact private", () => {
        const state = configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [
                { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
            ],
        });
        expect(state.configured).toBe(true);

        const files = snapshotFiles();
        expect(files.length).toBeGreaterThan(0);
        for (const name of files) {
            const mode = statSync(join(snapshotDir(), name)).mode & 0o777;
            expect(mode).toBe(0o600);
        }
    });

    it("adds the provider and points the claude-code profile at it", () => {
        const state = configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [
                { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
            ],
        });

        expect(state.configured).toBe(true);
        expect(state.model).toBe("openai/gpt-5.4-nano");

        const config = readConfig();
        const provider = config.Providers.find(
            (item: { name: string }) => item.name === "Pollinations",
        );
        expect(provider.api_base_url).toBe("https://gen.pollinations.ai/v1");
        expect(provider.api_key).toBe("sk_test_key");
        expect(provider.type).toBe("openai_chat_completions");
        expect(provider.enabled).toBe(true);
        expect(provider.models).toEqual(["openai/gpt-5.4-nano"]);

        const profile = config.profile.profiles.find(
            (item: { agent: string }) => item.agent === "claude-code",
        );
        expect(profile.model).toBe("Pollinations/openai/gpt-5.4-nano");
    });

    it("keeps unrelated providers and profiles", () => {
        configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
        });

        const config = readConfig();
        expect(
            config.Providers.map((item: { name: string }) => item.name),
        ).toEqual(["OpenRouter", "Pollinations"]);
        expect(config.profile.profiles).toHaveLength(2);
        expect(config.profile.profiles[1].model).toBe("");
    });

    it("restores the database on off", () => {
        const before = readConfig();

        configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
        });

        const state = disableClaudeCodeRouter(ctx);

        expect(state.outcome).toBe("restored");
        expect(state.configured).toBe(false);
        expect(readConfig()).toEqual(before);
        expect(snapshotFiles()).toEqual([]);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
        });
        const edited = readConfig();
        edited.APIKEY = "sk-user-edited";
        writeConfig(edited);

        const state = disableClaudeCodeRouter(ctx);

        expect(state.outcome).toBe("stripped");
        const config = readConfig();
        expect(config.APIKEY).toBe("sk-user-edited");
        expect(
            config.Providers.map((item: { name: string }) => item.name),
        ).toEqual(["OpenRouter"]);
        const profile = config.profile.profiles.find(
            (item: { agent: string }) => item.agent === "claude-code",
        );
        expect(profile.model).toBe("");
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        const state = disableClaudeCodeRouter(ctx);

        expect(state.outcome).toBe("unchanged");
        expect(readConfig()).toEqual(baseConfig());
    });

    it("reports unconfigured when the credential is missing", () => {
        configureClaudeCodeRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
        });
        const stripped = readConfig();
        stripped.Providers[1].api_key = "";
        writeConfig(stripped);

        expect(claudeCode.status(ctx).configured).toBe(false);
    });

    it("honors CCR_INTERNAL_HOME_DIR", () => {
        const custom = join(home, "custom-home");
        const scoped = {
            home,
            env: {
                CCR_INTERNAL_HOME_DIR: custom,
                PATH: join(home, "bin"),
            },
        };

        expect(claudeCodeRouterDir(scoped)).toBe(
            join(custom, ".claude-code-router"),
        );
    });

    it("stops before configuration when the router config is missing", async () => {
        rmSync(configPath(), { force: true });
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code Router config was not found",
        );
    });

    it("stops before configuration when the router CLI is missing", async () => {
        ctx = setup({ CCR_INTERNAL_HOME_DIR: home, PATH: join(home, "empty") });
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code Router was not found",
        );
    });

    it("stops before configuration when Claude Code is missing", async () => {
        rmSync(join(home, "bin", "claude"), { force: true });
        await expect(claudeCode.on(ctx, {})).rejects.toThrow(
            "Claude Code was not found",
        );
    });

    it("rolls back when the router has no claude-code profile", () => {
        const without = baseConfig();
        without.profile.profiles = without.profile.profiles.slice(1);
        writeConfig(without);

        expect(() =>
            configureClaudeCodeRouter(ctx, {
                apiKey: "sk_test_key",
                model: "openai/gpt-5.4-nano",
                models: [
                    { id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] },
                ],
            }),
        ).toThrow("no claude-code profile");
        expect(readConfig()).toEqual(without);
        expect(snapshotFiles()).toEqual([]);
    });
});
