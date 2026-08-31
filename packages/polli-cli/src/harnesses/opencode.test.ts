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
import { configureOpenCode, disableOpenCode, opencode } from "./opencode.js";
import type { HarnessContext } from "./types.js";

const settings = { apiKey: "sk_test_key", model: "deepseek" };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configDir = () => join(home, ".config", "opencode");
const configFile = () => join(configDir(), "opencode.json");
const pluginFile = () => join(home, ".config", "pollinations", "config.json");
const skillFile = () => join(configDir(), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("opencode harness", () => {
    it("enables the plugin, sets the default model, and stores the key", () => {
        const result = configureOpenCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "deepseek",
        });

        const config = JSON.parse(read(configFile()));
        expect(config.plugin).toEqual(["opencode-pollinations-plugin"]);
        expect(config.model).toBe("pollinations/deepseek");

        const pluginConfig = JSON.parse(read(pluginFile()));
        expect(pluginConfig.apiKey).toBe("sk_test_key");

        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(pluginFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing OpenCode and plugin configuration", () => {
        mkdirSync(configDir(), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({
                $schema: "https://opencode.ai/config.json",
                theme: "everforest",
                plugin: ["my-local-plugin"],
            }),
        );
        mkdirSync(join(home, ".config", "pollinations"), { recursive: true });
        writeFileSync(pluginFile(), JSON.stringify({ mode: "quest" }));

        configureOpenCode(ctx, settings);

        const config = JSON.parse(read(configFile()));
        expect(config.theme).toBe("everforest");
        expect(config.plugin).toEqual([
            "my-local-plugin",
            "opencode-pollinations-plugin",
        ]);
        expect(JSON.parse(read(pluginFile()))).toMatchObject({
            mode: "quest",
            apiKey: "sk_test_key",
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(configDir(), { recursive: true });
        const original = JSON.stringify({ theme: "everforest" });
        writeFileSync(configFile(), original);
        const originalPlugin = JSON.stringify({ mode: "quest" });
        mkdirSync(join(home, ".config", "pollinations"), { recursive: true });
        writeFileSync(pluginFile(), originalPlugin);

        configureOpenCode(ctx, settings);
        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(read(pluginFile())).toBe(originalPlugin);
        expect(existsSync(skillFile())).toBe(false);
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when files changed since on", () => {
        configureOpenCode(ctx, settings);
        const edited = JSON.parse(read(configFile()));
        edited.theme = "everforest";
        writeFileSync(configFile(), JSON.stringify(edited));

        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("stripped");
        const config = JSON.parse(read(configFile()));
        expect(config.theme).toBe("everforest");
        expect(config.plugin).toBeUndefined();
        expect(config.model).toBeUndefined();
        expect(JSON.parse(read(pluginFile())).apiKey).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
    });

    it("reports unchanged when off runs before on", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("deduplicates the plugin entry on repeated on", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, { ...settings, model: "kimi" });
        const config = JSON.parse(read(configFile()));
        expect(
            config.plugin.filter(
                (p: string) => p === "opencode-pollinations-plugin",
            ),
        ).toHaveLength(1);
        expect(config.model).toBe("pollinations/kimi");
    });

    it("honors OPENCODE_CONFIG_DIR", () => {
        const custom = join(home, "custom-oc");
        configureOpenCode(
            { home, env: { OPENCODE_CONFIG_DIR: custom } },
            settings,
        );
        expect(existsSync(join(custom, "opencode.json"))).toBe(true);
        expect(existsSync(configFile())).toBe(false);
    });

    it("reports unconfigured when the key is missing", () => {
        configureOpenCode(ctx, settings);
        pluginFile() && rmSync(pluginFile());
        expect(opencode.status(ctx).configured).toBe(false);
    });
});
