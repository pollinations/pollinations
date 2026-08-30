import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
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
const settings = { apiKey: "sk_test_key", model: "kimi", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-openclaw-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configPath = () => join(home, ".openclaw", "openclaw.json");
const skillFile = () => join(home, ".openclaw", "skills", "polli", "SKILL.md");
const snapshots = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("openclaw."))
        : [];
};
const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

describe("openclaw harness", () => {
    it("writes the provider, primary model, and skill from scratch", () => {
        const result = configureOpenClaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const cfg = readJson(configPath());
        expect(cfg.models?.mode).toBe("merge");
        const provider = (cfg.models as Record<string, unknown>).providers
            ?.pollinations as Record<string, unknown>;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKey: "sk_test_key",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect(
            (provider.models as Array<{ id: string }>).map((m) => m.id),
        ).toEqual(["kimi", "deepseek"]);
        expect((cfg.agents as Record<string, unknown>).defaults).toMatchObject({
            model: { primary: "pollinations/kimi" },
        });
        expect(readFileSync(skillFile(), "utf-8")).toContain("name: polli");
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("preserves existing agents, providers, and unrelated config", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configPath(),
            JSON.stringify({
                agents: {
                    defaults: { model: { primary: "anthropic/claude-opus-5" } },
                    entries: { writer: { default: true } },
                },
                models: {
                    mode: "replace",
                    providers: {
                        anthropic: { baseUrl: "https://api.anthropic.com" },
                    },
                },
                tools: { web: { search: { provider: "perplexity" } } },
            }),
        );

        configureOpenClaw(ctx, settings);

        const cfg = readJson(configPath());
        expect(cfg.models?.mode).toBe("replace"); // explicit choice preserved
        expect(cfg.models?.providers?.anthropic).toBeDefined();
        expect(cfg.models?.providers?.pollinations).toBeDefined();
        expect((cfg.agents as Record<string, unknown>).entries).toEqual({
            writer: { default: true },
        });
        expect((cfg.agents as Record<string, unknown>).defaults).toMatchObject({
            model: { primary: "pollinations/kimi" },
        });
        expect(cfg.tools).toBeDefined();
    });

    it("restores the original config byte-for-byte on off", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const original = `${JSON.stringify(
            { agents: { defaults: { model: "anthropic/claude-opus-5" } } },
            null,
            2,
        )}\n`;
        writeFileSync(configPath(), original);

        configureOpenClaw(ctx, settings);
        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(readFileSync(configPath(), "utf-8")).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when config changed since on", () => {
        configureOpenClaw(ctx, settings);
        const edited = readJson(configPath());
        (edited.agents as Record<string, unknown>).defaults = {
            model: { primary: "anthropic/claude-opus-5" },
        };
        writeFileSync(configPath(), JSON.stringify(edited, null, 2));

        const result = disableOpenClaw(ctx);

        expect(result.outcome).toBe("stripped");
        const cfg = readJson(configPath());
        expect(cfg.models?.providers?.pollinations).toBeUndefined();
        expect((cfg.agents as Record<string, unknown>).defaults).toMatchObject({
            model: { primary: "anthropic/claude-opus-5" },
        });
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenClaw(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the primary model", () => {
        configureOpenClaw(ctx, settings);
        configureOpenClaw(ctx, { ...settings, model: "deepseek" });
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenClaw(ctx);
        expect(existsSync(configPath())).toBe(false);
    });

    it("reports unconfigured when the skill is missing", () => {
        configureOpenClaw(ctx, settings);
        unlinkSync(skillFile());
        expect(openclaw.status(ctx).configured).toBe(false);
    });
});
