import {
    chmodSync,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureOpenCode, disableOpenCode, opencode } from "./opencode.js";
import { applyWithSnapshot } from "./snapshot.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "openai", contextWindow: 128000, input: ["text", "image"] },
    { id: "kimi", contextWindow: 64000, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: "openai", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configDir = () =>
    process.platform === "win32"
        ? join(home, "pollinations")
        : process.platform === "darwin"
          ? join(home, "Library", "Application Support", "pollinations")
          : join(home, ".config", "pollinations");
const opencodeFile = () => join(home, ".config", "opencode", "opencode.json");
const opencodeJsoncFile = () =>
    join(home, ".config", "opencode", "opencode.jsonc");
const legacyKeyFile = () => join(configDir(), "config.json");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("opencode."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readJsonFile = (path: string) => JSON.parse(read(path));

describe("opencode harness", () => {
    it("writes the provider block, default model, and key from scratch", () => {
        const result = configureOpenCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "openai",
        });

        const config = readJsonFile(opencodeFile());
        expect(config.$schema).toBe("https://opencode.ai/config.json");
        expect(config.plugin).toBeUndefined();
        expect(config.provider.pollinations).toMatchObject({
            npm: "@ai-sdk/openai-compatible",
            name: "Pollinations",
            options: {
                baseURL: "https://gen.pollinations.ai/v1",
                apiKey: "sk_test_key",
            },
        });
        expect(Object.keys(config.provider.pollinations.models)).toEqual([
            "openai",
            "kimi",
        ]);
        expect(config.provider.pollinations.models.openai).toMatchObject({
            tool_call: true,
            limit: { context: 128000, output: 32768 },
            modalities: { input: ["text", "image"], output: ["text"] },
        });
        expect(config.model).toBe("pollinations/openai");
        expect(existsSync(legacyKeyFile())).toBe(false);
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "openai",
        });
    });

    it("keeps existing providers, plugins, and unrelated settings", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const original = {
            $schema: "https://opencode.ai/config.json",
            autoupdate: true,
            plugin: ["opencode-gitlab-plugin"],
            provider: {
                anthropic: { options: { baseURL: "https://api.example" } },
            },
            small_model: "anthropic/claude-haiku",
        };
        writeFileSync(opencodeFile(), JSON.stringify(original, null, 2));

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.autoupdate).toBe(true);
        expect(config.small_model).toBe("anthropic/claude-haiku");
        expect(config.provider.anthropic.options.baseURL).toBe(
            "https://api.example",
        );
        expect(config.plugin).toEqual(["opencode-gitlab-plugin"]);
        expect(config.provider.pollinations.options.apiKey).toBe("sk_test_key");
    });

    it("replaces an earlier plugin setup, including its private key", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            opencodeFile(),
            JSON.stringify({
                plugin: [
                    "other-plugin",
                    { package: "opencode-pollinations-plugin@6.5.1" },
                ],
                model: "pollinations/enter/openai",
            }),
        );
        mkdirSync(configDir(), { recursive: true });
        writeFileSync(
            legacyKeyFile(),
            JSON.stringify({ mode: "quest", lang: "en", apiKey: "sk_old_key" }),
        );

        const result = configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.plugin).toEqual(["other-plugin"]);
        expect(config.model).toBe("pollinations/openai");
        expect(readJsonFile(legacyKeyFile())).toEqual({
            mode: "quest",
            lang: "en",
        });
        expect(result.configured).toBe(true);
    });

    it("uses the highest-precedence existing JSONC config", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const json = '{"autoupdate":false}\n';
        const jsonc = `{
            // OpenCode accepts comments and trailing commas.
            autoupdate: true,
        }`;
        writeFileSync(opencodeFile(), json);
        writeFileSync(opencodeJsoncFile(), jsonc);

        configureOpenCode(ctx, settings);

        expect(read(opencodeFile())).toBe(json);
        expect(readJsonFile(opencodeJsoncFile())).toMatchObject({
            autoupdate: true,
            model: "pollinations/openai",
        });

        disableOpenCode(ctx);
        expect(read(opencodeJsoncFile())).toBe(jsonc);
    });

    it("refuses to overwrite an invalid config", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(opencodeFile(), "{");

        expect(() => configureOpenCode(ctx, settings)).toThrow(
            "Could not parse OpenCode config",
        );
        expect(read(opencodeFile())).toBe("{");
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("uses an existing plugins array instead of plugin", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            opencodeFile(),
            JSON.stringify({ plugins: ["other-plugin"] }),
        );

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.plugins).toEqual(["other-plugin"]);
        expect(config.plugin).toBeUndefined();
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const original = `${JSON.stringify({ model: "anthropic/claude-sonnet" }, null, 2)}\n`;
        writeFileSync(opencodeFile(), original);

        configureOpenCode(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(original);
        expect(existsSync(legacyKeyFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it.each(["absolute", "relative"])(
        "restores an original %s config symlink on off",
        (kind) => {
            mkdirSync(join(home, ".config", "opencode"), { recursive: true });
            const target = join(home, "opencode-dotfile.jsonc");
            const original =
                '{\n  // Original dotfile\n  model: "other/model",\n}\n';
            writeFileSync(target, original, { mode: 0o400 });
            const link =
                kind === "absolute" ? target : "../../opencode-dotfile.jsonc";
            symlinkSync(link, opencodeJsoncFile(), "file");
            const targetMode = lstatSync(target).mode;

            configureOpenCode(ctx, settings);
            configureOpenCode(ctx, { ...settings, model: "kimi" });
            expect(lstatSync(opencodeJsoncFile()).isFile()).toBe(true);
            expect(read(target)).toBe(original);
            expect(disableOpenCode(ctx).outcome).toBe("restored");

            expect(lstatSync(opencodeJsoncFile()).isSymbolicLink()).toBe(true);
            expect(readlinkSync(opencodeJsoncFile())).toBe(link);
            expect(read(target)).toBe(original);
            expect(lstatSync(target).mode).toBe(targetMode);
            chmodSync(target, 0o600);
            writeFileSync(target, '{"autoupdate":false}\n');
            expect(read(opencodeJsoncFile())).toBe('{"autoupdate":false}\n');
            expect(snapshotFiles()).toHaveLength(0);
        },
    );

    it("restores the original config symlink when setup fails", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const target = join(home, "invalid-opencode.json");
        writeFileSync(target, "{");
        const link = "../../invalid-opencode.json";
        symlinkSync(link, opencodeFile(), "file");

        expect(() => configureOpenCode(ctx, settings)).toThrow(
            "Could not parse OpenCode config",
        );

        expect(lstatSync(opencodeFile()).isSymbolicLink()).toBe(true);
        expect(readlinkSync(opencodeFile())).toBe(link);
        expect(read(target)).toBe("{");
        expect(existsSync(legacyKeyFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("keeps user edits instead of restoring the original config symlink", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const target = join(home, "opencode-dotfile.json");
        const original = '{"autoupdate":true}\n';
        writeFileSync(target, original);
        symlinkSync(target, opencodeFile(), "file");
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        writeFileSync(opencodeFile(), JSON.stringify(edited));

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        expect(lstatSync(opencodeFile()).isFile()).toBe(true);
        expect(readJsonFile(opencodeFile()).autoupdate).toBe(false);
        expect(readJsonFile(opencodeFile()).plugin).toBeUndefined();
        expect(readJsonFile(opencodeFile()).model).toBeUndefined();
        expect(read(target)).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("restores snapshots without symlink metadata as regular files", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const target = join(home, "opencode-dotfile.json");
        const original = '{"autoupdate":true}\n';
        writeFileSync(target, original);
        symlinkSync(target, opencodeFile(), "file");
        configureOpenCode(ctx, settings);
        const path = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        const snapshot = readJsonFile(path);
        delete snapshot.files[opencodeFile()].symlink;
        writeFileSync(path, JSON.stringify(snapshot));

        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(lstatSync(opencodeFile()).isFile()).toBe(true);
        expect(read(opencodeFile())).toBe(original);
        expect(read(target)).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("restores the removed plugin's key file on off", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            opencodeFile(),
            JSON.stringify({ plugin: ["opencode-pollinations-plugin"] }),
        );
        mkdirSync(configDir(), { recursive: true });
        const legacy = `${JSON.stringify({ apiKey: "sk_old_key" }, null, 2)}\n`;
        writeFileSync(legacyKeyFile(), legacy);

        configureOpenCode(ctx, settings);
        expect(existsSync(legacyKeyFile())).toBe(false);

        expect(disableOpenCode(ctx).outcome).toBe("restored");
        expect(read(legacyKeyFile())).toBe(legacy);
    });

    it.each([
        ["off", false],
        ["on, then off", true],
    ])(
        "restores a snapshot written by the earlier plugin-based CLI (%s)",
        (_, onAgain) => {
            mkdirSync(join(home, ".config", "opencode"), { recursive: true });
            const original = '{"model":"anthropic/claude-sonnet"}\n';
            writeFileSync(opencodeFile(), original);
            applyWithSnapshot(
                ctx,
                "opencode",
                [opencodeFile(), legacyKeyFile()],
                () => {
                    writeFileSync(
                        opencodeFile(),
                        JSON.stringify({
                            plugin: ["opencode-pollinations-plugin"],
                            model: "pollinations/enter/openai",
                        }),
                    );
                    mkdirSync(configDir(), { recursive: true });
                    writeFileSync(legacyKeyFile(), '{"apiKey":"sk_old_key"}');
                },
            );

            if (onAgain) configureOpenCode(ctx, settings);
            expect(disableOpenCode(ctx).outcome).toBe("restored");
            expect(read(opencodeFile())).toBe(original);
            expect(existsSync(legacyKeyFile())).toBe(false);
        },
    );

    it("strips an earlier plugin setup and its key when no backup exists", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            opencodeFile(),
            JSON.stringify({
                plugin: ["other-plugin", "opencode-pollinations-plugin"],
                model: "pollinations/enter/openai",
            }),
        );
        mkdirSync(configDir(), { recursive: true });
        writeFileSync(
            legacyKeyFile(),
            JSON.stringify({ apiKey: "sk_old_key", mode: "free" }),
        );

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        const config = readJsonFile(opencodeFile());
        expect(config.plugin).toEqual(["other-plugin"]);
        expect(config.model).toBeUndefined();
        expect(readJsonFile(legacyKeyFile())).toEqual({ mode: "free" });
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        writeFileSync(opencodeFile(), JSON.stringify(edited, null, 2));

        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("stripped");
        const config = readJsonFile(opencodeFile());
        expect(config.autoupdate).toBe(false);
        expect(config.provider).toBeUndefined();
        expect(config.model).toBeUndefined();
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, { ...settings, model: "kimi" });
        expect(opencode.status(ctx).model).toBe("kimi");

        disableOpenCode(ctx);
        expect(existsSync(opencodeFile())).toBe(false);
    });

    it("keeps edits made between repeated on runs", () => {
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        writeFileSync(opencodeFile(), JSON.stringify(edited, null, 2));
        configureOpenCode(ctx, { ...settings, model: "kimi" });

        expect(disableOpenCode(ctx).outcome).toBe("stripped");
        expect(readJsonFile(opencodeFile()).autoupdate).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("honors OPENCODE_CONFIG", () => {
        const custom = join(home, "custom", "my-opencode.json");
        configureOpenCode({ home, env: { OPENCODE_CONFIG: custom } }, settings);
        expect(existsSync(custom)).toBe(true);
        expect(existsSync(opencodeFile())).toBe(false);
        expect(readJsonFile(custom).model).toBe("pollinations/openai");
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

    it("reports unconfigured when the credential is missing", () => {
        configureOpenCode(ctx, settings);
        const config = readJsonFile(opencodeFile());
        delete config.provider.pollinations.options.apiKey;
        writeFileSync(opencodeFile(), JSON.stringify(config, null, 2));
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("recognizes an object-form legacy plugin entry", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            opencodeFile(),
            JSON.stringify({
                plugin: [{ package: "opencode-pollinations-plugin@6.5.1" }],
                model: "pollinations/enter/openai",
            }),
        );

        const result = configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.plugin).toBeUndefined();
        expect(result.configured).toBe(true);
    });

    it("stops before configuration when OpenCode is unavailable", async () => {
        await expect(opencode.on(ctx, {})).rejects.toThrow(
            "OpenCode was not found",
        );
        expect(existsSync(opencodeFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
