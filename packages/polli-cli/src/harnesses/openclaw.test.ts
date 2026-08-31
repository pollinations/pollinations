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
import { configureOpenclaw, disableOpenclaw, openclaw } from "./openclaw.js";
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

const configFile = () => join(home, ".openclaw", "openclaw.json");
const skillFile = () => join(home, ".openclaw", "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("openclaw harness", () => {
    it("adds the provider, default model, and skill from scratch", () => {
        const result = configureOpenclaw(
            ctx,
            models,
            "sk_test_key",
            "deepseek",
        );
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "deepseek",
        });

        const doc = JSON.parse(read(configFile()));
        const provider = doc.models.providers.pollinations;
        expect(provider).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
            apiKey: "sk_test_key",
        });
        expect(provider.models).toHaveLength(2);
        expect(provider.models[0]).toMatchObject({
            id: "deepseek",
            contextWindow: 1048576,
            maxTokens: 8192,
        });
        expect(doc.agents.defaults.model.primary).toBe("pollinations/deepseek");
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps unrelated config and an existing non-Pollinations primary", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({
                models: {
                    providers: {
                        openai: { baseUrl: "https://api.openai.com/v1" },
                    },
                },
                agents: { defaults: { model: { primary: "openai/gpt" } } },
                channels: { telegram: { botToken: "keep" } },
            }),
        );

        configureOpenclaw(ctx, models, "sk_test_key", "deepseek");

        const doc = JSON.parse(read(configFile()));
        expect(doc.models.providers.openai).toBeDefined();
        expect(doc.models.providers.pollinations).toBeDefined();
        expect(doc.agents.defaults.model.primary).toBe("openai/gpt");
        expect(doc.channels.telegram.botToken).toBe("keep");
    });

    it("restores the original file byte-for-byte on off", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const original = JSON.stringify({ agents: {} });
        writeFileSync(configFile(), original);

        configureOpenclaw(ctx, models, "sk_test_key", "deepseek");
        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when the file changed since on", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "deepseek");
        const edited = JSON.parse(read(configFile()));
        edited.channels = { telegram: {} };
        writeFileSync(configFile(), JSON.stringify(edited));

        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = JSON.parse(read(configFile()));
        expect(doc.channels.telegram).toEqual({});
        expect(doc.models.providers.pollinations).toBeUndefined();
        expect(doc.agents.defaults.model.primary).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
    });

    it("reports unchanged when off runs before on", () => {
        expect(disableOpenclaw(ctx).outcome).toBe("unchanged");
    });

    it("honors OPENCLAW_STATE_DIR", () => {
        const custom = join(home, "custom-oc-state");
        configureOpenclaw(
            { home, env: { OPENCLAW_STATE_DIR: custom } },
            models,
            "sk_test_key",
            "deepseek",
        );
        expect(existsSync(join(custom, "openclaw.json"))).toBe(true);
        expect(existsSync(configFile())).toBe(false);
    });

    it("reports unconfigured when the provider block is missing", () => {
        configureOpenclaw(ctx, models, "sk_test_key", "deepseek");
        const doc = JSON.parse(read(configFile()));
        delete doc.models.providers.pollinations;
        writeFileSync(configFile(), JSON.stringify(doc));
        expect(openclaw.status(ctx).configured).toBe(false);
    });
});
