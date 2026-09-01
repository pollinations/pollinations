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
import {
    configureOpenclaw,
    disableOpenclaw,
    openclaw,
    openclawStateDir,
} from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
];

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-openclaw-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const stateDir = () => join(home, ".openclaw");
const configFile = () => join(stateDir(), "openclaw.json");
const skillFile = () => join(stateDir(), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) =>
    JSON.parse(read(path)) as Record<string, unknown>;
const providers = (path = configFile()) =>
    (readJson(path).models as Record<string, Record<string, unknown>>)
        .providers;
const pollinations = (config: Record<string, unknown>) =>
    (config.models as Record<string, Record<string, Record<string, unknown>>>)
        .providers.pollinations as Record<string, unknown>;
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((file) => file.startsWith("openclaw."))
        : [];
};

describe("openclaw harness", () => {
    it("writes the provider, key, default model, and skill from scratch", () => {
        const result = configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        expect(providers().pollinations).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
            apiKey: "sk_test_key",
        });
        expect(
            (providers().pollinations.models as { id: string }[]).map(
                (model) => model.id,
            ),
        ).toEqual(["kimi", "deepseek"]);
        expect(readJson(configFile()).agents).toMatchObject({
            defaults: { model: { primary: "pollinations/kimi" } },
        });
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("keeps existing providers and unrelated config", () => {
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify(
                {
                    models: {
                        providers: {
                            ollama: {
                                baseUrl: "http://localhost:11434/v1",
                                models: [],
                            },
                        },
                    },
                    gateway: { port: 36400 },
                    channels: { telegram: { enabled: true } },
                },
                null,
                2,
            ),
        );

        configureOpenclaw(ctx, models, "sk_test_key", "kimi");

        expect(providers().ollama).toBeDefined();
        expect(providers().pollinations).toBeDefined();
        const config = readJson(configFile());
        expect(config.gateway).toEqual({ port: 36400 });
        expect(config.channels).toEqual({ telegram: { enabled: true } });
    });

    it("keeps an existing primary model instead of overriding it", () => {
        mkdirSync(stateDir(), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({
                agents: {
                    defaults: { model: { primary: "anthropic/claude" } },
                },
            }),
        );

        const result = configureOpenclaw(ctx, models, "sk_test_key", "kimi");

        expect(readJson(configFile()).agents).toMatchObject({
            defaults: { model: { primary: "anthropic/claude" } },
        });
        expect(result.configured).toBe(true);
        expect(result.model).toBeUndefined();
    });

    it("restores the original file byte-for-byte on off", () => {
        mkdirSync(stateDir(), { recursive: true });
        const original = JSON.stringify({
            models: { providers: { ollama: { models: [] } } },
        });
        writeFileSync(configFile(), original);

        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("strips only the Pollinations entries when config changed since on", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        const edited = readJson(configFile());
        (
            edited.models as Record<string, Record<string, unknown>>
        ).providers.ollama = { models: [] };
        writeFileSync(configFile(), JSON.stringify(edited));

        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("stripped");
        expect(providers().ollama).toBeDefined();
        expect(providers().pollinations).toBeUndefined();
        expect(
            (readJson(configFile()).agents as Record<string, unknown>).defaults,
        ).toMatchObject({ model: {} });
        expect(existsSync(skillFile())).toBe(false);
    });

    it("removes the models block when Pollinations was the only provider", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        writeFileSync(
            configFile(),
            JSON.stringify({
                ...readJson(configFile()),
                gateway: { port: 36400 },
            }),
        );

        disableOpenclaw(ctx);

        const config = readJson(configFile());
        expect(config.models).toBeUndefined();
        expect(config.gateway).toEqual({ port: 36400 });
    });

    it("reports unchanged when off runs before on", () => {
        expect(disableOpenclaw(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        configureOpenclaw(ctx, models, "sk_test_key", "deepseek");
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenclaw(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("honors OPENCLAW_STATE_DIR", () => {
        const custom = join(home, "custom-openclaw");
        configureOpenclaw(
            { home, env: { OPENCLAW_STATE_DIR: custom } },
            models,
            "sk_test_key",
            "kimi",
        );
        expect(existsSync(join(custom, "openclaw.json"))).toBe(true);
        expect(existsSync(configFile())).toBe(false);
    });

    it("treats an empty OPENCLAW_STATE_DIR as unset", () => {
        configureOpenclaw(
            { home, env: { OPENCLAW_STATE_DIR: "  " } },
            models,
            "sk",
            "kimi",
        );
        expect(existsSync(configFile())).toBe(true);
    });

    it("openclawStateDir resolves to default when env is unset", () => {
        expect(openclawStateDir(ctx)).toBe(join(home, ".openclaw"));
    });

    it("reports unconfigured when the API key is missing", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        const config = readJson(configFile());
        pollinations(config).apiKey = "";
        writeFileSync(configFile(), JSON.stringify(config));
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("reports unconfigured when the provider points elsewhere", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        const config = readJson(configFile());
        pollinations(config).baseUrl = "https://example.com/v1";
        writeFileSync(configFile(), JSON.stringify(config));
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        writeFileSync(snapshot, "{");
        expect(() => disableOpenclaw(ctx)).toThrow();
        expect(snapshotFiles()).toHaveLength(1);
        expect(openclaw.status(ctx).configured).toBe(true);
    });

    it("does not overwrite an existing skill file", () => {
        mkdirSync(join(stateDir(), "skills", "polli"), { recursive: true });
        writeFileSync(skillFile(), "custom content");

        configureOpenclaw(ctx, models, "sk_test_key", "kimi");
        expect(read(skillFile())).toBe("custom content");
    });

    it("stops before configuration when OpenClaw is unavailable", async () => {
        await expect(openclaw.on(ctx, {})).rejects.toThrow(
            "OpenClaw was not found",
        );
        expect(existsSync(stateDir())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
