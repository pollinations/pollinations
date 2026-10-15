import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASE_URL } from "../lib/config.js";
import { configureOpenCode, disableOpenCode, opencode } from "./opencode.js";
import type { HarnessContext, HarnessModel } from "./types.js";

const models: HarnessModel[] = [
    { id: "openai", contextWindow: 128_000, input: ["text"] },
    { id: "openai-vision", contextWindow: 128_000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "openai", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const opencodeFile = () => join(home, ".config", "opencode", "opencode.json");
const opencodeJsoncFile = () =>
    join(home, ".config", "opencode", "opencode.jsonc");
const writeOpencode = (config: unknown) => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(opencodeFile(), `${JSON.stringify(config, null, 2)}\n`);
};
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("opencode."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readJsonFile = (path: string) => JSON.parse(read(path));

interface WrittenProvider {
    npm: string;
    options: { baseURL: string; apiKey: string };
    models: Record<string, { name: string; attachment: boolean }>;
}
const providerOf = (config: Record<string, unknown>) =>
    (config.provider as Record<string, WrittenProvider>).pollinations;

describe("opencode harness", () => {
    it("writes the provider, models, default model, and key from scratch", () => {
        const result = configureOpenCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "openai",
        });

        const config = readJsonFile(opencodeFile());
        expect(config.$schema).toBe("https://opencode.ai/config.json");
        const provider = providerOf(config);
        expect(provider.npm).toBe("@ai-sdk/openai-compatible");
        expect(provider.options.baseURL).toBe(`${BASE_URL}/v1`);
        expect(provider.options.apiKey).toBe("sk_test_key");
        expect(provider.models.openai).toEqual({
            name: "openai",
            attachment: false,
        });
        expect(provider.models["openai-vision"].attachment).toBe(true);
        expect(config.model).toBe("pollinations/openai");
        expect(config.plugin).toBeUndefined();
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "openai",
        });
    });

    it("keeps existing providers and unrelated settings", () => {
        writeOpencode({
            $schema: "https://opencode.ai/config.json",
            autoupdate: true,
            provider: {
                anthropic: { options: { baseURL: "https://api.example" } },
            },
            small_model: "anthropic/claude-haiku",
        });

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.autoupdate).toBe(true);
        expect(config.small_model).toBe("anthropic/claude-haiku");
        expect(config.provider.anthropic.options.baseURL).toBe(
            "https://api.example",
        );
        expect(providerOf(config).options.apiKey).toBe("sk_test_key");
    });

    it("replaces an earlier plugin setup with the provider", () => {
        writeOpencode({ plugin: ["opencode-pollinations-plugin"] });

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.plugin).toBeUndefined();
        expect(providerOf(config).npm).toBe("@ai-sdk/openai-compatible");
        expect(config.model).toBe("pollinations/openai");
    });

    it("drops only the Pollinations entries from a plugins array", () => {
        writeOpencode({
            plugins: [
                "opencode-gitlab-plugin",
                { package: "opencode-pollinations-plugin@6.5.1" },
            ],
        });

        configureOpenCode(ctx, settings);

        const config = readJsonFile(opencodeFile());
        expect(config.plugins).toEqual(["opencode-gitlab-plugin"]);
        expect(config.plugin).toBeUndefined();
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
    });

    it("restores the original files byte-for-byte on off", () => {
        const original = `${JSON.stringify({ model: "anthropic/claude-sonnet" }, null, 2)}\n`;
        writeOpencode({ model: "anthropic/claude-sonnet" });
        const before = read(opencodeFile());
        expect(before).toBe(original);

        configureOpenCode(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(opencodeFile())).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
        expect(opencode.status(ctx).configured).toBe(false);
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

    it("keeps other providers when stripping", () => {
        writeOpencode({
            provider: {
                anthropic: { options: { baseURL: "https://api.example" } },
            },
        });
        configureOpenCode(ctx, settings);

        disableOpenCode(ctx);

        const config = readJsonFile(opencodeFile());
        expect(config.provider.anthropic.options.baseURL).toBe(
            "https://api.example",
        );
        expect(config.provider.pollinations).toBeUndefined();
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, { ...settings, model: "openai-vision" });
        expect(opencode.status(ctx).model).toBe("openai-vision");

        disableOpenCode(ctx);
        expect(existsSync(opencodeFile())).toBe(false);
    });

    it("keeps edits made between repeated on runs", () => {
        configureOpenCode(ctx, settings);
        const edited = readJsonFile(opencodeFile());
        edited.autoupdate = false;
        writeFileSync(opencodeFile(), JSON.stringify(edited, null, 2));
        configureOpenCode(ctx, { ...settings, model: "openai-vision" });

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
        const edited = readJsonFile(opencodeFile());
        delete edited.provider.pollinations.options.apiKey;
        writeFileSync(opencodeFile(), JSON.stringify(edited, null, 2));

        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("recognizes a provider without a Pollinations default model", () => {
        writeOpencode({
            provider: { pollinations: { options: { apiKey: "sk_test_key" } } },
            model: "anthropic/claude-sonnet",
        });

        const status = opencode.status(ctx);
        expect(status.configured).toBe(false);
        expect(status.model).toBeUndefined();
    });

    it("stops before configuration when OpenCode is unavailable", async () => {
        await expect(opencode.on(ctx, {})).rejects.toThrow(
            "OpenCode was not found",
        );
        expect(existsSync(opencodeFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
