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
import { configureOpenclaw, disableOpenclaw, openclaw } from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 256000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1000000, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: "kimi", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".openclaw", "openclaw.json");
const skillFile = () => join(home, ".openclaw", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("openclaw."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readConfig = () => JSON.parse(read(configFile()));

describe("openclaw harness", () => {
    it("writes the provider, default model, key, and skill from scratch", () => {
        const result = configureOpenclaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const config = readConfig();
        expect(config.agents.defaults.model.primary).toBe("pollinations/kimi");
        expect(config.models.mode).toBe("merge");
        expect(config.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
        const provider = config.models.providers.pollinations;
        expect(provider).toMatchObject({
            api: "openai-completions",
            baseUrl: "https://gen.pollinations.ai/v1",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw's own ${VAR} substitution, not a JS template
            apiKey: "${POLLI_OPENCLAW_API_KEY}",
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "kimi",
            "deepseek",
        ]);
        expect(provider.models[0].contextWindow).toBe(256000);

        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("keeps existing config, agents, and channels untouched", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify(
                {
                    channels: { telegram: { token: "abc" } },
                    models: {
                        mode: "replace",
                        providers: { openai: { apiKey: "sk-openai" } },
                    },
                    agents: {
                        defaults: { model: { primary: "openai/gpt-5.6" } },
                    },
                },
                null,
                2,
            ),
        );

        configureOpenclaw(ctx, settings);

        const config = readConfig();
        expect(config.channels).toEqual({ telegram: { token: "abc" } });
        expect(config.models.providers.openai).toEqual({
            apiKey: "sk-openai",
        });
        // An explicit prior choice of "replace" is not silently overridden.
        expect(config.models.mode).toBe("replace");
        expect(config.agents.defaults.model.primary).toBe("pollinations/kimi");
    });

    it("restores the original config and skill byte-for-byte on off", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const original = JSON.stringify({ workspace: "/home/me/agent" });
        writeFileSync(configFile(), original);

        configureOpenclaw(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("only strips Pollinations entries when the config changed since on", () => {
        configureOpenclaw(ctx, settings);
        const edited = readConfig();
        edited.channels = { discord: { token: "xyz" } };
        writeFileSync(configFile(), JSON.stringify(edited, null, 2));

        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("stripped");
        const config = readConfig();
        expect(config.channels).toEqual({ discord: { token: "xyz" } });
        expect(config.models.providers.pollinations).toBeUndefined();
        expect(config.agents.defaults.model.primary).toBeUndefined();
        expect(config.env.vars.POLLI_OPENCLAW_API_KEY).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("does not strip an unrelated default model on off", () => {
        configureOpenclaw(ctx, settings);
        const edited = readConfig();
        edited.agents.defaults.model.primary = "openai/gpt-5.6";
        writeFileSync(configFile(), JSON.stringify(edited, null, 2));

        disableOpenclaw(ctx);

        expect(readConfig().agents.defaults.model.primary).toBe(
            "openai/gpt-5.6",
        );
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenclaw(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenclaw(ctx, settings);
        configureOpenclaw(ctx, { ...settings, model: "deepseek" });
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenclaw(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("honors OPENCLAW_HOME", () => {
        const custom = join(home, "custom-home");
        configureOpenclaw({ home, env: { OPENCLAW_HOME: custom } }, settings);
        expect(existsSync(join(custom, ".openclaw", "openclaw.json"))).toBe(
            true,
        );
        expect(existsSync(configFile())).toBe(false);
    });

    it("honors OPENCLAW_STATE_DIR", () => {
        const custom = join(home, "state");
        configureOpenclaw(
            { home, env: { OPENCLAW_STATE_DIR: custom } },
            settings,
        );
        expect(existsSync(join(custom, "openclaw.json"))).toBe(true);
    });

    it("honors OPENCLAW_CONFIG_PATH", () => {
        const custom = join(home, "custom.json");
        configureOpenclaw(
            { home, env: { OPENCLAW_CONFIG_PATH: custom } },
            settings,
        );
        expect(existsSync(custom)).toBe(true);
        expect(existsSync(configFile())).toBe(false);
    });

    it("reports unconfigured when the credential is missing", () => {
        configureOpenclaw(ctx, settings);
        const edited = readConfig();
        delete edited.env.vars.POLLI_OPENCLAW_API_KEY;
        writeFileSync(configFile(), JSON.stringify(edited, null, 2));
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("rejects a config file that is not valid JSON", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(configFile(), "{not json");
        expect(() => configureOpenclaw(ctx, settings)).toThrow(/valid JSON/);
    });

    it("reports the managed files", () => {
        const status = openclaw.status(ctx);
        expect(status.files).toEqual([configFile(), skillFile()]);
    });
});
