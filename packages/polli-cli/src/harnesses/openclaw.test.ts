import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { configureOpenClaw, disableOpenClaw, openclaw } from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 256000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: "kimi", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".openclaw", "openclaw.json");
const envFile = () => join(home, ".openclaw", ".env");
const skillFile = () => join(home, ".openclaw", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("openclaw."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

const configObj = () => parse(read(configFile())) as Record<string, unknown>;

describe("openclaw harness", () => {
    it("writes the provider, env key, skill, and default model from scratch", () => {
        const result = configureOpenClaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const config = configObj();
        expect(config.agents?.defaults?.model).toEqual({
            primary: "pollinations/kimi",
        });

        const provider = (config.models as Record<string, unknown>).providers
            .pollinations as Record<string, unknown>;
        expect(provider).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            apiKey: "SecretRef/POLLI_OPENCLAW_API_KEY",
            api: "openai-completions",
        });
        expect(provider.models).toHaveLength(2);
        expect(
            (provider.models as Record<string, unknown>[]).map((m) => m.id),
        ).toEqual(["kimi", "deepseek"]);

        expect(parseEnv(read(envFile())).POLLI_OPENCLAW_API_KEY).toBe(
            "sk_test_key",
        );
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("preserves existing providers, env entries, and agent defaults", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const existing = {
            models: {
                providers: {
                    anthropic: {
                        baseUrl: "https://api.anthropic.com",
                        apiKey: "SecretRef/ANTHROPIC_API_KEY",
                        api: "openai-completions",
                        models: [{ id: "claude-3", name: "Claude 3" }],
                    },
                },
            },
            env: {
                ANTHROPIC_API_KEY: "existing-key",
            },
            agents: {
                defaults: {
                    model: { primary: "anthropic/claude-3", temperature: 0.7 },
                },
            },
        };
        writeFileSync(configFile(), JSON.stringify(existing, null, 2));
        writeFileSync(envFile(), "ANTHROPIC_API_KEY=existing-key\n");

        configureOpenClaw(ctx, settings);

        const config = configObj();
        // Existing provider survives
        expect(
            (config.models as Record<string, unknown>).providers.anthropic,
        ).toBeDefined();
        // Existing env survives
        expect(read(envFile())).toContain("ANTHROPIC_API_KEY=existing-key");
        // Existing default model survives (not just pollinations)
        expect(config.agents?.defaults?.model).toMatchObject({
            primary: "pollinations/kimi",
            temperature: 0.7,
        });
        // Pollinations provider was added
        expect(
            (config.models as Record<string, unknown>).providers.pollinations,
        ).toBeDefined();
    });

    it("restores the original files byte-for-byte on off", () => {
        const original = JSON.stringify(
            {
                models: { providers: { anthropic: { id: "claude" } } },
                agents: {
                    defaults: { model: { primary: "anthropic/claude-3" } },
                },
            },
            null,
            2,
        );
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), original);

        configureOpenClaw(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);

        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when config changed since on", () => {
        configureOpenClaw(ctx, settings);
        // User edits something unrelated
        const config = configObj();
        (config.agents as Record<string, unknown>).defaults = {
            ...((config.agents as Record<string, unknown>).defaults as Record<
                string,
                unknown
            >),
            temperature: 0.5,
        };
        writeFileSync(configFile(), JSON.stringify(config, null, 2));

        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = configObj();
        expect(doc.models?.providers).not.toHaveProperty("pollinations");
        expect(
            parseEnv(read(envFile())).POLLI_OPENCLAW_API_KEY,
        ).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        // Unrelated user edit survives
        expect(doc.agents?.defaults?.temperature).toBe(0.5);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenClaw(ctx).outcome).toBe("unchanged");
    });

    it("switches the default model on re-run", () => {
        configureOpenClaw(ctx, settings);
        configureOpenClaw(ctx, { ...settings, model: "deepseek" });
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenClaw(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("keeps one backup per harness home", () => {
        configureOpenClaw(ctx, settings);
        const moved: HarnessContext = {
            home,
            env: { OPENCLAW_HOME: join(home, "moved") },
        };
        configureOpenClaw(moved, settings);
        expect(snapshotFiles()).toHaveLength(2);

        expect(disableOpenClaw(moved).outcome).toBe("restored");
        expect(existsSync(join(home, "moved", "openclaw.json"))).toBe(false);
        // The original location is untouched and still has its own backup.
        expect(openclaw.status(ctx).configured).toBe(true);
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("reports unconfigured when the credential is missing", () => {
        configureOpenClaw(ctx, settings);
        rmSync(envFile());
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configureOpenClaw(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        writeFileSync(snapshot, "{");

        expect(() => disableOpenClaw(ctx)).toThrow();
        expect(snapshotFiles()).toHaveLength(1);
        expect(openclaw.status(ctx).configured).toBe(true);
    });

    it("rolls back earlier files when the config is invalid JSON", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const invalidConfig = "{ invalid json";
        writeFileSync(configFile(), invalidConfig);

        expect(() => configureOpenClaw(ctx, settings)).toThrow();

        // The corrupt config is preserved (rollback restores it)
        expect(read(configFile())).toBe(invalidConfig);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
