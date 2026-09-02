import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureOpenClaw, disableOpenClaw, openclaw } from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
];

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const stateDir = () => join(home, ".openclaw");
const configFile = () => join(stateDir(), "openclaw.json");
const skillFile = () => join(stateDir(), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("openclaw harness", () => {
    it("writes the provider, key, default model, and skill from scratch", () => {
        const result = configureOpenClaw(ctx, models, "sk_test_key", "kimi");
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const doc = JSON.parse(read(configFile()));
        expect(doc.models.mode).toBe("merge");
        expect(doc.models.providers.pollinations).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
            apiKey: "${POLLI_OPENCLAW_API_KEY}",
        });
        expect(
            doc.models.providers.pollinations.models.map((m: { id: string }) => m.id),
        ).toEqual(["kimi", "deepseek"]);
        expect(doc.agents.defaults.model.primary).toBe("pollinations/kimi");
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("keeps existing providers, env vars, and unrelated config", () => {
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({
                env: { vars: { OPENAI_API_KEY: "ant" } },
                models: {
                    providers: {
                        ollama: {
                            baseUrl: "http://localhost:11434/v1",
                            api: "openai-completions",
                            apiKey: "${OLLAMA_API_KEY}",
                            models: [{ id: "llama3.1:8b" }],
                        },
                    },
                },
                channels: { discord: { enabled: true } },
            }),
        );

        configureOpenClaw(ctx, models, "sk_test_key", "kimi");

        const doc = JSON.parse(read(configFile()));
        expect(doc.env.vars.OPENAI_API_KEY).toBe("ant");
        expect(doc.models.providers.ollama.models).toEqual([
            { id: "llama3.1:8b" },
        ]);
        expect(doc.channels.discord.enabled).toBe(true);
    });

    it("does not override an explicit models.mode the user set", () => {
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({ models: { mode: "replace" } }),
        );

        configureOpenClaw(ctx, models, "sk_test_key", "kimi");

        expect(JSON.parse(read(configFile())).models.mode).toBe("replace");
    });

    it("restores the original config byte-for-byte on off", () => {
        mkdirSync(stateDir(), { recursive: true });
        const original = JSON.stringify({
            agents: { defaults: { model: { primary: "anthropic/claude-sonnet" } } },
        });
        writeFileSync(configFile(), original);

        configureOpenClaw(ctx, models, "sk_test_key", "kimi");
        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when files changed since on", () => {
        configureOpenClaw(ctx, models, "sk_test_key", "kimi");
        const edited = JSON.parse(read(configFile()));
        edited.agents.defaults.model.primary = "openai/gpt-5.6";
        edited.models.providers.ollama = {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "${OLLAMA_API_KEY}",
            models: [{ id: "llama3.1:8b" }],
        };
        edited.env.vars.OPENAI_API_KEY = "keepme";
        edited.channels = { discord: { enabled: true } };
        writeFileSync(configFile(), JSON.stringify(edited));

        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = JSON.parse(read(configFile()));
        expect(doc.models.providers.ollama).toBeDefined();
        expect(doc.models.providers.pollinations).toBeUndefined();
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBeUndefined();
        expect(doc.env.vars.OPENAI_API_KEY).toBe("keepme");
        // A user-chosen default model survives stripping.
        expect(doc.agents.defaults.model.primary).toBe("openai/gpt-5.6");
        expect(doc.channels.discord.enabled).toBe(true);
        expect(existsSync(skillFile())).toBe(false);
    });

    it("reports unchanged when off runs before on", () => {
        expect(disableOpenClaw(ctx).outcome).toBe("unchanged");
    });

    it("honors OPENCLAW_CONFIG_PATH including tilde expansion", () => {
        const custom = join(home, "custom", "my-openclaw.json");
        configureOpenClaw(
            { home, env: { OPENCLAW_CONFIG_PATH: custom } },
            models,
            "sk_test_key",
            "kimi",
        );
        expect(existsSync(custom)).toBe(true);
        expect(existsSync(configFile())).toBe(false);

        configureOpenClaw(
            { home, env: { OPENCLAW_CONFIG_PATH: "~/tilde-openclaw.json" } },
            models,
            "sk_test_key",
            "kimi",
        );
        expect(existsSync(join(home, "tilde-openclaw.json"))).toBe(true);
    });

    it("honors OPENCLAW_STATE_DIR", () => {
        const custom = join(home, "custom-state");
        configureOpenClaw(
            { home, env: { OPENCLAW_STATE_DIR: custom } },
            models,
            "sk_test_key",
            "kimi",
        );
        expect(existsSync(join(custom, "openclaw.json"))).toBe(true);
        expect(existsSync(join(custom, "skills", "polli", "SKILL.md"))).toBe(
            true,
        );
        expect(existsSync(configFile())).toBe(false);
    });

    it("reports unconfigured when the credential is missing", () => {
        configureOpenClaw(ctx, models, "sk_test_key", "kimi");
        const doc = JSON.parse(read(configFile()));
        delete doc.env.vars.POLLI_OPENCLAW_API_KEY;
        writeFileSync(configFile(), `${JSON.stringify(doc, null, 2)}\n`);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("stops before configuration when OpenClaw is unavailable", async () => {
        await expect(openclaw.on(ctx, {})).rejects.toThrow(
            "OpenClaw was not found",
        );
        expect(existsSync(stateDir())).toBe(false);
    });
});
