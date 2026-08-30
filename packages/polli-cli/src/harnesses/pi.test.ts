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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configurePi, disablePi, pi, piAgentDir } from "./pi.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "deepseek", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-pi-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const agentDir = () => join(home, ".pi", "agent");
const modelsFile = () => join(agentDir(), "models.json");
const authFile = () => join(agentDir(), "auth.json");
const settingsFile = () => join(agentDir(), "settings.json");
const skillFile = () => join(agentDir(), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) =>
    JSON.parse(read(path)) as Record<string, unknown>;
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("pi."))
        : [];
};

describe("pi harness", () => {
    it("writes provider, auth key, default model, and skill from scratch", () => {
        const result = configurePi(ctx, settings);
        expect(result).toMatchObject({
            harness: "pi",
            configured: true,
            model: "deepseek",
        });

        const modelsData = readJson(modelsFile());
        const provider = (modelsData.providers as Record<string, unknown>)
            .pollinations as Record<string, unknown>;
        expect(provider).toMatchObject({
            api: "openai-completions",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect((provider.models as { id: string }[]).map((m) => m.id)).toEqual([
            "deepseek",
            "kimi",
        ]);

        const authData = readJson(authFile());
        const authEntry = authData.pollinations as Record<string, unknown>;
        expect(authEntry).toEqual({ type: "api_key", key: "sk_test_key" });

        const settingsData = readJson(settingsFile());
        expect(settingsData.defaultProvider).toBe("pollinations");
        expect(settingsData.defaultModel).toBe("deepseek");

        expect(read(skillFile())).toContain("name: polli");

        expect(statSync(modelsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(authFile()).mode & 0o777).toBe(0o600);
        expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);

        expect(pi.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing provider, auth, and settings entries", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: {
                    ollama: {
                        baseUrl: "http://localhost:11434/v1",
                        api: "openai-completions",
                    },
                },
            }),
        );
        writeFileSync(
            authFile(),
            JSON.stringify({ openai: { type: "api_key", key: "sk-openai" } }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({ theme: "dark", enableSkillCommands: true }),
        );

        configurePi(ctx, settings);

        const modelsData = readJson(modelsFile());
        const providers = modelsData.providers as Record<string, unknown>;
        expect(providers.ollama).toBeDefined();
        expect(providers.pollinations).toBeDefined();

        const authData = readJson(authFile());
        expect(authData.openai).toEqual({ type: "api_key", key: "sk-openai" });
        expect((authData.pollinations as Record<string, unknown>).key).toBe(
            "sk_test_key",
        );

        const settingsData = readJson(settingsFile());
        expect(settingsData.theme).toBe("dark");
        expect(settingsData.enableSkillCommands).toBe(true);
        expect(settingsData.defaultProvider).toBe("pollinations");
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(agentDir(), { recursive: true });
        const originalModels =
            '{"providers":{"ollama":{"api":"openai-completions"}}}\n';
        writeFileSync(modelsFile(), originalModels);

        configurePi(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);

        const result = disablePi(ctx);
        expect(result.outcome).toBe("restored");
        expect(read(modelsFile())).toBe(originalModels);
        expect(existsSync(authFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("strips only the Pollinations entries when config changed since on", () => {
        configurePi(ctx, settings);

        // Simulate user edits after harness setup
        const data = readJson(settingsFile());
        data.theme = "light";
        writeFileSync(settingsFile(), `${JSON.stringify(data, null, 2)}\n`);

        const result = disablePi(ctx);
        expect(result.outcome).toBe("stripped");

        const settingsData = readJson(settingsFile());
        expect(settingsData.theme).toBe("light");
        expect(settingsData.defaultProvider).toBeUndefined();
        expect(settingsData.defaultModel).toBeUndefined();
        expect(readJson(modelsFile()).providers).toEqual({});
        expect(readJson(authFile()).pollinations).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disablePi(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configurePi(ctx, settings);
        configurePi(ctx, { ...settings, model: "kimi" });
        expect(pi.status(ctx).model).toBe("kimi");

        disablePi(ctx);
        expect(existsSync(modelsFile())).toBe(false);
    });

    it("honors PI_CODING_AGENT_DIR", () => {
        const custom = join(home, "custom-pi-agent");
        configurePi({ home, env: { PI_CODING_AGENT_DIR: custom } }, settings);
        expect(existsSync(join(custom, "models.json"))).toBe(true);
        expect(existsSync(modelsFile())).toBe(false);
    });

    it("treats an empty PI_CODING_AGENT_DIR as unset", () => {
        configurePi({ home, env: { PI_CODING_AGENT_DIR: "  " } }, settings);
        expect(existsSync(modelsFile())).toBe(true);
    });

    it("expands a tilde in PI_CODING_AGENT_DIR", () => {
        configurePi(
            { home, env: { PI_CODING_AGENT_DIR: "~/custom-pi" } },
            settings,
        );
        expect(existsSync(join(home, "custom-pi", "models.json"))).toBe(true);
    });

    it("piAgentDir resolves to default when env is unset", () => {
        expect(piAgentDir(ctx)).toBe(join(home, ".pi", "agent"));
    });

    it("reports unconfigured when the API key is missing", () => {
        configurePi(ctx, settings);
        rmSync(authFile());
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("reports unconfigured when models.json is corrupt JSON", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(modelsFile(), "{bad json");
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configurePi(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        writeFileSync(snapshot, "{");
        expect(() => disablePi(ctx)).toThrow();
        expect(snapshotFiles()).toHaveLength(1);
        expect(pi.status(ctx).configured).toBe(true);
    });

    it("keeps one backup per harness home", () => {
        configurePi(ctx, settings);
        const moved = {
            home,
            env: { PI_CODING_AGENT_DIR: join(home, "moved") },
        };
        configurePi(moved, settings);
        expect(snapshotFiles()).toHaveLength(2);

        expect(disablePi(moved).outcome).toBe("restored");
        expect(existsSync(join(home, "moved", "models.json"))).toBe(false);
        expect(pi.status(ctx).configured).toBe(true);
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("does not overwrite an existing skill file", () => {
        mkdirSync(join(agentDir(), "skills", "polli"), { recursive: true });
        writeFileSync(skillFile(), "custom content");

        configurePi(ctx, settings);
        expect(read(skillFile())).toBe("custom content");
    });
});
