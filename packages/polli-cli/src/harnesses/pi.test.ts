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
import { configurePi, disablePi, pi } from "./pi.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const agentDir = () => join(home, ".pi", "agent");
const modelsFile = () => join(agentDir(), "models.json");
const authFile = () => join(agentDir(), "auth.json");
const settingsFile = () => join(agentDir(), "settings.json");
const skillFile = () => join(agentDir(), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("pi harness", () => {
    it("writes the provider, credential, default model, and skill from scratch", () => {
        const result = configurePi(ctx, models, "sk_test_key", "deepseek");
        expect(result).toMatchObject({
            harness: "pi",
            configured: true,
            model: "deepseek",
        });

        const doc = JSON.parse(read(modelsFile()));
        const provider = doc.providers.pollinations;
        expect(provider).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
            compat: { supportsDeveloperRole: false },
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "deepseek",
            "kimi",
        ]);

        expect(JSON.parse(read(authFile()))).toEqual({
            pollinations: { type: "api_key", key: "sk_test_key" },
        });
        expect(JSON.parse(read(settingsFile()))).toMatchObject({
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(modelsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(authFile()).mode & 0o777).toBe(0o600);
        expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        expect(pi.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing providers, settings, and auth entries", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: {
                    ollama: {
                        baseUrl: "http://localhost:11434/v1",
                        api: "openai-completions",
                        apiKey: "ollama",
                        models: [{ id: "llama3.1:8b" }],
                    },
                },
            }),
        );
        writeFileSync(
            authFile(),
            JSON.stringify({ anthropic: { type: "api_key", key: "ant" } }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({ defaultThinkingLevel: "low" }),
        );

        configurePi(ctx, models, "sk_test_key", "deepseek");

        const doc = JSON.parse(read(modelsFile()));
        expect(doc.providers.ollama.models).toEqual([{ id: "llama3.1:8b" }]);
        expect(JSON.parse(read(authFile()))).toMatchObject({
            anthropic: { type: "api_key", key: "ant" },
            pollinations: { type: "api_key", key: "sk_test_key" },
        });
        expect(JSON.parse(read(settingsFile()))).toMatchObject({
            defaultThinkingLevel: "low",
            defaultProvider: "pollinations",
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(agentDir(), { recursive: true });
        const original = JSON.stringify({
            providers: { ollama: { models: [] } },
        });
        writeFileSync(modelsFile(), original);

        configurePi(ctx, models, "sk_test_key", "deepseek");
        const result = disablePi(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(modelsFile())).toBe(original);
        expect(existsSync(authFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when files changed since on", () => {
        configurePi(ctx, models, "sk_test_key", "deepseek");
        const edited = JSON.parse(read(modelsFile()));
        edited.providers.ollama = { models: [] };
        writeFileSync(modelsFile(), JSON.stringify(edited));

        const result = disablePi(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = JSON.parse(read(modelsFile()));
        expect(doc.providers.ollama).toBeDefined();
        expect(doc.providers.pollinations).toBeUndefined();
        expect(
            JSON.parse(read(settingsFile())).defaultProvider,
        ).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
    });

    it("reports unchanged when off runs before on", () => {
        expect(disablePi(ctx).outcome).toBe("unchanged");
    });

    it("honors PI_CODING_AGENT_DIR including tilde expansion", () => {
        const custom = join(home, "custom-pi");
        configurePi(
            { home, env: { PI_CODING_AGENT_DIR: custom } },
            models,
            "sk_test_key",
            "deepseek",
        );
        expect(existsSync(join(custom, "models.json"))).toBe(true);
        expect(existsSync(modelsFile())).toBe(false);

        const tilde = { home, env: { PI_CODING_AGENT_DIR: "~/tilde-pi" } };
        configurePi(tilde, models, "sk_test_key", "deepseek");
        expect(existsSync(join(home, "tilde-pi", "models.json"))).toBe(true);
    });

    it("treats an empty PI_CODING_AGENT_DIR as unset", () => {
        configurePi(
            { home, env: { PI_CODING_AGENT_DIR: "  " } },
            models,
            "sk",
            "deepseek",
        );
        expect(existsSync(modelsFile())).toBe(true);
    });

    it("reports unconfigured when the credential is missing", () => {
        configurePi(ctx, models, "sk_test_key", "deepseek");
        rmSync(authFile());
        expect(pi.status(ctx).configured).toBe(false);
    });
});
