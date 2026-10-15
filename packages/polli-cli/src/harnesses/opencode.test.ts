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
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureOpenCode, disableOpenCode, opencode } from "./opencode.js";
import { applyWithSnapshot } from "./snapshot.js";
import type { HarnessContext } from "./types.js";

const models = [
    {
        id: "openai/gpt-6-sol",
        contextWindow: 1050000,
        input: ["text", "image"],
    },
    { id: "moonshotai/kimi-k2.6", contextWindow: 64000, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: models[0].id, models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const pluginDir = () =>
    process.platform === "win32"
        ? join(home, "pollinations")
        : process.platform === "darwin"
          ? join(home, "Library", "Application Support", "pollinations")
          : join(home, ".config", "pollinations");
const opencodeFile = () => join(home, ".config", "opencode", "opencode.json");
const opencodeJsoncFile = () =>
    join(home, ".config", "opencode", "opencode.jsonc");
const pluginConfig = () => join(pluginDir(), "config.json");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("opencode."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readJsonFile = (path: string) => JSON.parse(read(path));
const save = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
};

describe("opencode harness", () => {
    it("writes an authenticated provider usable by both OpenCode 1.x and 2.0", () => {
        const result = configureOpenCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "openai/gpt-6-sol",
        });

        const config = readJsonFile(opencodeFile());
        expect(config.$schema).toBe("https://opencode.ai/config.json");
        expect(config.plugin).toBeUndefined();
        expect(config.model).toBe("pollinations/openai/gpt-6-sol");
        expect(config.provider.pollinations).toMatchObject({
            npm: "@ai-sdk/openai-compatible",
            options: {
                baseURL: "https://gen.pollinations.ai/v1",
                apiKey: "sk_test_key",
            },
        });
        expect(config.providers.pollinations).toMatchObject({
            package: "@opencode/ai/providers/openai-compatible",
            settings: {
                baseURL: "https://gen.pollinations.ai/v1",
                apiKey: "sk_test_key",
            },
        });
        expect(Object.keys(config.provider.pollinations.models)).toEqual([
            "openai/gpt-6-sol",
            "moonshotai/kimi-k2.6",
        ]);
        expect(config.provider.pollinations.models[models[0].id]).toMatchObject(
            {
                tool_call: true,
                limit: { context: 1050000, output: 16384 },
                modalities: { input: ["text", "image"], output: ["text"] },
            },
        );
        expect(
            config.providers.pollinations.models[models[0].id],
        ).toMatchObject({
            capabilities: {
                tools: true,
                input: ["text", "image"],
                output: ["text"],
            },
        });
        expect(existsSync(pluginConfig())).toBe(false);
        if (process.platform !== "win32") {
            expect(statSync(opencodeFile()).mode & 0o777).toBe(0o600);
        }
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "openai/gpt-6-sol",
        });
    });

    it("preserves other providers, plugins, and settings", () => {
        const original = {
            autoupdate: true,
            plugin: ["opencode-gitlab-plugin"],
            provider: {
                anthropic: { options: { baseURL: "https://api.example" } },
            },
            providers: {
                openai: { settings: { baseURL: "https://api.example/v1" } },
            },
            small_model: "anthropic/claude-haiku",
        };
        save(opencodeFile(), JSON.stringify(original));

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.autoupdate).toBe(true);
        expect(config.small_model).toBe("anthropic/claude-haiku");
        expect(config.provider.anthropic).toEqual(original.provider.anthropic);
        expect(config.providers.openai).toEqual(original.providers.openai);
        expect(config.plugin).toEqual(["opencode-gitlab-plugin"]);
    });

    it("replaces the old plugin setup without deleting its pre-existing key", () => {
        const oldConfig = JSON.stringify({
            plugin: ["another-plugin", "opencode-pollinations-plugin"],
            model: "pollinations/enter/openai/gpt-6-sol",
        });
        const oldPlugin = JSON.stringify({
            mode: "free",
            apiKey: "sk_original",
        });
        save(opencodeFile(), oldConfig);
        save(pluginConfig(), oldPlugin);

        configureOpenCode(ctx, settings);

        expect(readJsonFile(opencodeFile()).plugin).toEqual(["another-plugin"]);
        expect(readJsonFile(opencodeFile()).model).toBe(
            "pollinations/openai/gpt-6-sol",
        );
        expect(read(pluginConfig())).toBe(oldPlugin);
        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(oldConfig);
        expect(read(pluginConfig())).toBe(oldPlugin);
    });

    it("overrides an existing native 2.0 provider while on, then restores it", () => {
        const original = JSON.stringify({
            providers: {
                pollinations: {
                    package: "@opencode/ai/providers/openai-compatible",
                    settings: { baseURL: "https://other.example/v1" },
                    models: { old: {} },
                },
            },
        });
        save(opencodeFile(), original);

        configureOpenCode(ctx, settings);
        const config = readJsonFile(opencodeFile());
        expect(config.providers.pollinations.settings).toEqual({
            baseURL: "https://gen.pollinations.ai/v1",
            apiKey: "sk_test_key",
        });
        expect(
            config.providers.pollinations.models[models[0].id],
        ).toBeDefined();
        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(original);
    });

    it("uses the highest-precedence existing JSONC config", () => {
        const json = '{"autoupdate":false}\n';
        const jsonc = `{
            // OpenCode accepts comments and trailing commas.
            autoupdate: true,
        }`;
        save(opencodeFile(), json);
        save(opencodeJsoncFile(), jsonc);

        configureOpenCode(ctx, settings);

        expect(read(opencodeFile())).toBe(json);
        expect(readJsonFile(opencodeJsoncFile())).toMatchObject({
            autoupdate: true,
            model: "pollinations/openai/gpt-6-sol",
        });
        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(opencodeJsoncFile())).toBe(jsonc);
    });

    it("refuses to overwrite an invalid config", () => {
        save(opencodeFile(), "{");
        expect(() => configureOpenCode(ctx, settings)).toThrow(
            "Could not parse OpenCode config",
        );
        expect(read(opencodeFile())).toBe("{");
        expect(existsSync(pluginConfig())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("restores existing settings byte-for-byte on off", () => {
        const original = `${JSON.stringify({ model: "anthropic/claude-sonnet" }, null, 2)}\n`;
        save(opencodeFile(), original);
        configureOpenCode(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);

        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries if the config changed since on", () => {
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        save(opencodeFile(), JSON.stringify(edited));

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        const config = readJsonFile(opencodeFile());
        expect(config.autoupdate).toBe(false);
        expect(config.provider).toBeUndefined();
        expect(config.providers).toBeUndefined();
        expect(config.model).toBeUndefined();
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("does not erase an unrelated old plugin key during a partial restore", () => {
        const originalPlugin = '{"apiKey":"sk_original","mode":"quest"}\n';
        save(pluginConfig(), originalPlugin);
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        save(opencodeFile(), JSON.stringify(edited));

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        expect(read(pluginConfig())).toBe(originalPlugin);
    });

    it("can still restore a snapshot written by the older plugin-based CLI", () => {
        const original = '{"model":"anthropic/claude-sonnet"}\n';
        save(opencodeFile(), original);
        applyWithSnapshot(
            ctx,
            "opencode",
            [opencodeFile(), pluginConfig()],
            () => {
                save(
                    opencodeFile(),
                    JSON.stringify({
                        plugin: ["opencode-pollinations-plugin"],
                        model: "pollinations/enter/openai",
                    }),
                );
                save(pluginConfig(), '{"apiKey":"sk_test_old"}');
            },
        );

        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(original);
        expect(existsSync(pluginConfig())).toBe(false);
    });

    it("can strip the old plugin and its key if its snapshot is missing", () => {
        save(
            opencodeFile(),
            JSON.stringify({
                plugin: ["another-plugin", "opencode-pollinations-plugin"],
                model: "pollinations/enter/openai",
            }),
        );
        save(pluginConfig(), '{"apiKey":"sk_test_old","mode":"free"}');

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        expect(readJsonFile(opencodeFile()).plugin).toEqual(["another-plugin"]);
        expect(readJsonFile(opencodeFile()).model).toBeUndefined();
        expect(readJsonFile(pluginConfig())).toEqual({ mode: "free" });
    });

    it("reports unchanged when off runs on a harness never enabled", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches models but keeps the pre-on backup", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, { ...settings, model: models[1].id });
        expect(opencode.status(ctx).model).toBe("moonshotai/kimi-k2.6");
        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(existsSync(opencodeFile())).toBe(false);
    });

    it("keeps user edits made between repeated on runs", () => {
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        save(opencodeFile(), JSON.stringify(edited));
        configureOpenCode(ctx, { ...settings, model: models[1].id });

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        expect(readJsonFile(opencodeFile()).autoupdate).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("honors OPENCODE_CONFIG", () => {
        const custom = join(home, "custom", "my-opencode.json");
        configureOpenCode({ home, env: { OPENCODE_CONFIG: custom } }, settings);
        expect(existsSync(custom)).toBe(true);
        expect(existsSync(opencodeFile())).toBe(false);
        expect(readJsonFile(custom).model).toBe(
            "pollinations/openai/gpt-6-sol",
        );
    });

    it("honors OPENCODE_CONFIG_DIR", () => {
        const customDir = join(home, "custom-dir");
        configureOpenCode(
            { home, env: { OPENCODE_CONFIG_DIR: customDir } },
            settings,
        );
        expect(existsSync(join(customDir, "opencode.json"))).toBe(true);
        expect(existsSync(opencodeFile())).toBe(false);
    });

    it("reports unconfigured when the provider key is missing", () => {
        configureOpenCode(ctx, settings);
        const config = readJsonFile(opencodeFile());
        delete config.providers.pollinations.settings.apiKey;
        save(opencodeFile(), JSON.stringify(config));
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("stops before writing config when OpenCode is unavailable", async () => {
        await expect(opencode.on(ctx, {})).rejects.toThrow(
            "OpenCode was not found",
        );
        expect(existsSync(opencodeFile())).toBe(false);
        expect(existsSync(pluginConfig())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
