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
import {
    configureOpenCode,
    disableOpenCode,
    openCodeConfigDir,
    opencode,
} from "./opencode.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 262000, input: ["text", "image"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = {
    apiKey: "sk_test_key",
    model: "deepseek",
    models,
    plugin: true,
};

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-opencode-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configPath = (c: HarnessContext = ctx) =>
    join(openCodeConfigDir(c), "opencode.json");
const snapshots = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("opencode."))
        : [];
};
const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

describe("opencode harness", () => {
    it("writes the provider, plugin, and default model from scratch", () => {
        const result = configureOpenCode(ctx, settings);
        expect(result).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "deepseek",
            mcp: true,
        });

        const provider = readJson(configPath()).provider?.pollinations as
            | Record<string, unknown>
            | undefined;
        expect(provider).toMatchObject({
            npm: "@ai-sdk/openai-compatible",
        });
        expect((provider?.options as Record<string, unknown>).baseURL).toBe(
            "https://gen.pollinations.ai/v1",
        );
        expect((provider?.options as Record<string, unknown>).apiKey).toBe(
            "sk_test_key",
        );
        const ocModels = provider?.models as Record<string, unknown>;
        expect(Object.keys(ocModels)).toEqual(["deepseek", "kimi"]);
        expect((ocModels.kimi as Record<string, unknown>).attachment).toBe(
            true,
        );
        expect((ocModels.kimi as Record<string, unknown>).tool_call).toBe(true);

        const cfg = readJson(configPath());
        expect(cfg.model).toBe("pollinations/deepseek");
        expect(cfg.plugin).toContain("opencode-pollinations-plugin");
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
            mcp: true,
        });
    });

    it("preserves existing providers, plugins, and settings", () => {
        mkdirSync(openCodeConfigDir(ctx), { recursive: true });
        writeFileSync(
            configPath(),
            JSON.stringify({
                provider: {
                    anthropic: { npm: "@ai-sdk/anthropic" },
                },
                plugin: ["some-other-plugin"],
                model: "anthropic/claude-opus-4-7",
            }),
        );

        configureOpenCode(ctx, settings);

        const cfg = readJson(configPath());
        expect(cfg.provider?.anthropic).toBeDefined();
        expect(cfg.provider?.pollinations).toBeDefined();
        expect(cfg.plugin).toContain("some-other-plugin");
        expect(cfg.plugin).toContain("opencode-pollinations-plugin");
        expect(cfg.model).toBe("pollinations/deepseek");
    });

    it("restores the original config byte-for-byte on off", () => {
        mkdirSync(openCodeConfigDir(ctx), { recursive: true });
        const original = `${JSON.stringify(
            { model: "anthropic/claude-opus-4-7" },
            null,
            2,
        )}\n`;
        writeFileSync(configPath(), original);

        configureOpenCode(ctx, settings);
        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("restored");
        expect(readFileSync(configPath(), "utf-8")).toBe(original);
        expect(snapshots()).toHaveLength(0);
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when config changed since on", () => {
        configureOpenCode(ctx, settings);
        const edited = readJson(configPath());
        (edited.provider as Record<string, unknown>).anthropic = {
            npm: "@ai-sdk/anthropic",
        };
        edited.model = "anthropic/claude-opus-4-7";
        edited.plugin = ["some-other-plugin", "opencode-pollinations-plugin"];
        writeFileSync(configPath(), JSON.stringify(edited, null, 2));

        const result = disableOpenCode(ctx);

        expect(result.outcome).toBe("stripped");
        const cfg = readJson(configPath());
        expect(cfg.provider?.pollinations).toBeUndefined();
        expect(cfg.provider?.anthropic).toBeDefined();
        expect(cfg.plugin).toEqual(["some-other-plugin"]);
        expect(cfg.model).toBe("anthropic/claude-opus-4-7");
        expect(snapshots()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("supports skipping the plugin", () => {
        configureOpenCode(ctx, { ...settings, plugin: false });
        const cfg = readJson(configPath());
        expect(opencode.status(ctx).mcp).toBe(false);
        expect(cfg.plugin).toBeUndefined();
    });

    it("honors OPENCODE_CONFIG_DIR", () => {
        const custom = join(home, "custom-opencode");
        const c: HarnessContext = {
            home,
            env: { OPENCODE_CONFIG_DIR: custom },
        };
        configureOpenCode(c, settings);
        expect(existsSync(join(custom, "opencode.json"))).toBe(true);
        expect(existsSync(configPath())).toBe(false);
    });

    it("reports unconfigured when the key is missing", () => {
        configureOpenCode(ctx, settings);
        const cfg = readJson(configPath());
        (cfg.provider as Record<string, unknown>).pollinations = {
            options: { baseURL: "https://gen.pollinations.ai/v1" },
        };
        writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
        expect(opencode.status(ctx).configured).toBe(false);
    });
});
