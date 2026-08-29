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
    { id: "openai", contextWindow: 128000, input: ["text"] },
    { id: "openai-vision", contextWindow: 128000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "openai", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-opencode-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const ocConfig = () => join(home, ".config", "opencode", "opencode.json");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("opencode."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) => JSON.parse(read(path));

describe("opencode harness", () => {
    it("writes provider, plugin, and model from scratch", () => {
        const r = configureOpenCode(ctx, settings);
        expect(r).toMatchObject({
            harness: "opencode",
            configured: true,
            model: "openai",
            mcp: true,
        });

        const cfg = readJson(ocConfig());
        expect(cfg.model).toBe("pollinations/openai");
        expect(cfg.provider.pollinations).toMatchObject({
            npm: "@ai-sdk/openai-compatible",
            name: "Pollinations.ai",
            options: {
                baseURL: "https://gen.pollinations.ai/v1",
                apiKey: "sk_test_key",
            },
        });
        expect(cfg.provider.pollinations.models.openai).toMatchObject({
            name: "openai",
            limit: { context: 128000 },
            tool_call: true,
        });
        expect(cfg.provider.pollinations.models["openai-vision"]).toMatchObject(
            {
                attachment: true,
            },
        );
        expect(cfg.plugin).toContain("opencode-pollinations-plugin");
        expect(opencode.status(ctx)).toMatchObject({
            configured: true,
            model: "openai",
        });
    });

    it("preserves existing config keys and other providers", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        writeFileSync(
            ocConfig(),
            JSON.stringify(
                {
                    $schema: "https://opencode.ai/config.json",
                    theme: "dark",
                    provider: { anthropic: { options: { timeout: 60000 } } },
                    plugin: ["another-plugin"],
                },
                null,
                2,
            ),
        );

        configureOpenCode(ctx, settings);

        const cfg = readJson(ocConfig());
        expect(cfg.$schema).toBe("https://opencode.ai/config.json");
        expect(cfg.theme).toBe("dark");
        expect(cfg.provider.anthropic).toMatchObject({
            options: { timeout: 60000 },
        });
        expect(cfg.provider.pollinations).toBeDefined();
        expect(cfg.plugin).toContain("another-plugin");
        expect(cfg.plugin).toContain("opencode-pollinations-plugin");
    });

    it("restores the original file byte-for-byte on off", () => {
        mkdirSync(join(home, ".config", "opencode"), { recursive: true });
        const original = `${JSON.stringify({ theme: "dark" }, null, 2)}\n`;
        writeFileSync(ocConfig(), original);

        configureOpenCode(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const r = disableOpenCode(ctx);

        expect(r.outcome).toBe("restored");
        expect(read(ocConfig())).toBe(original);
        expect(snapshotFiles()).toHaveLength(0);
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when the config changed since on", () => {
        configureOpenCode(ctx, settings);

        const cfg = readJson(ocConfig());
        cfg["editor-theme"] = "monokai";
        writeFileSync(ocConfig(), `${JSON.stringify(cfg, null, 2)}\n`);

        const r = disableOpenCode(ctx);

        expect(r.outcome).toBe("stripped");
        const after = readJson(ocConfig());
        expect(after["editor-theme"]).toBe("monokai");
        expect(after.provider?.pollinations).toBeUndefined();
        expect(after.model).toBeUndefined();
        expect(
            (after.plugin ?? []).some((p: string) =>
                p.includes("opencode-pollinations-plugin"),
            ),
        ).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off on a harness that was never on", () => {
        expect(disableOpenCode(ctx).outcome).toBe("unchanged");
    });

    it("can skip plugin with --no-mcp", () => {
        const r = configureOpenCode(ctx, { ...settings, mcp: false });

        expect(r).toMatchObject({ configured: true, mcp: false });
        const cfg = readJson(ocConfig());
        expect(cfg.plugin ?? []).not.toContain("opencode-pollinations-plugin");
        expect(cfg.provider.pollinations).toBeDefined();
    });

    it("re-running on updates model and keeps the pre-on backup", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, { ...settings, model: "openai-vision" });
        expect(opencode.status(ctx).model).toBe("openai-vision");

        disableOpenCode(ctx);
        expect(existsSync(ocConfig())).toBe(false);
    });

    it("honors OPENCODE_CONFIG_DIR", () => {
        const custom = join(home, "my-opencode");
        configureOpenCode(
            { home, env: { OPENCODE_CONFIG_DIR: custom } },
            settings,
        );
        expect(existsSync(join(custom, "opencode.json"))).toBe(true);
        expect(existsSync(ocConfig())).toBe(false);
    });

    it("treats an empty OPENCODE_CONFIG_DIR as unset", () => {
        configureOpenCode(
            { home, env: { OPENCODE_CONFIG_DIR: "  " } },
            settings,
        );
        expect(existsSync(ocConfig())).toBe(true);
    });

    it("reports unconfigured when no config file exists", () => {
        expect(opencode.status(ctx).configured).toBe(false);
    });

    it("does not add duplicate plugin entries on re-run", () => {
        configureOpenCode(ctx, settings);
        configureOpenCode(ctx, settings);
        const cfg = readJson(ocConfig());
        const count = (cfg.plugin as string[]).filter((p) =>
            p.includes("opencode-pollinations-plugin"),
        ).length;
        expect(count).toBe(1);
    });

    it("openCodeConfigDir returns correct path from env", () => {
        const custom = join(home, "custom");
        expect(
            openCodeConfigDir({ home, env: { OPENCODE_CONFIG_DIR: custom } }),
        ).toBe(custom);
    });

    it("openCodeConfigDir defaults to ~/.config/opencode", () => {
        expect(openCodeConfigDir({ home, env: {} })).toBe(
            join(home, ".config", "opencode"),
        );
    });

    it("keeps one backup per config location", () => {
        configureOpenCode(ctx, settings);
        const moved = { home, env: { OPENCODE_CONFIG_DIR: join(home, "alt") } };
        configureOpenCode(moved, settings);
        expect(snapshotFiles()).toHaveLength(2);

        disableOpenCode(moved);
        expect(snapshotFiles()).toHaveLength(1);
        expect(opencode.status(ctx).configured).toBe(true);
    });
});
