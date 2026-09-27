import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { configureHermes, disableHermes, hermes } from "./hermes.js";
import type { HarnessContext } from "./types.js";

const settings = { apiKey: "sk_test_key", model: "deepseek" };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".hermes", "config.yaml");
const envFile = () => join(home, ".hermes", ".env");
const skillFile = () => join(home, ".hermes", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("hermes."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

describe("hermes harness", () => {
    it("writes the provider, model default, skill, and credential from scratch", () => {
        const result = configureHermes(ctx, settings);
        expect(result).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "deepseek",
        });

        const doc = parse(read(configFile()));
        expect(doc.providers.pollinations).toMatchObject({
            base_url: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
            api_mode: "chat_completions",
        });
        expect(doc.model).toEqual({
            provider: "pollinations",
            default: "deepseek",
        });

        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBe(
            "sk_test_key",
        );
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(statSync(join(home, ".hermes")).mode & 0o777).toBe(0o700);
        expect(hermes.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing settings, comments, and environment values", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "# my notes\nterminal:\n  backend: local\nmodel:\n  provider: openrouter\n  default: gpt-5\n",
        );
        writeFileSync(
            envFile(),
            "# local env\nOPENROUTER_API_KEY=or-secret\n",
            {
                mode: 0o644,
            },
        );

        configureHermes(ctx, settings);

        const text = read(configFile());
        expect(text).toContain("# my notes");
        expect(parse(text).terminal).toEqual({ backend: "local" });
        expect(read(envFile())).toContain("# local env");
        expect(parseEnv(read(envFile()))).toMatchObject({
            OPENROUTER_API_KEY: "or-secret",
            POLLI_HERMES_API_KEY: "sk_test_key",
        });
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        const original = "model:\n  provider: openrouter\n  default: gpt-5\n";
        writeFileSync(configFile(), original);

        configureHermes(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableHermes(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(hermes.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureHermes(ctx, settings);
        const edited = parse(read(configFile()));
        edited.terminal = { backend: "local" };
        writeFileSync(configFile(), JSON.stringify(edited));

        const result = disableHermes(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = parse(read(configFile()));
        expect(doc.terminal).toEqual({ backend: "local" });
        expect(doc.providers?.pollinations).toBeUndefined();
        expect(doc.model?.provider).toBeUndefined();
        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableHermes(ctx).outcome).toBe("unchanged");
    });

    it("keeps a user's own default model provider on off", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "model:\n  provider: openrouter\n  default: gpt-5\n",
        );
        // Never connected via the harness — off must not touch the file.
        disableHermes(ctx);
        expect(parse(read(configFile())).model).toEqual({
            provider: "openrouter",
            default: "gpt-5",
        });
    });

    it("honors HERMES_HOME", () => {
        const custom = join(home, "custom-hermes");
        configureHermes({ home, env: { HERMES_HOME: custom } }, settings);
        expect(existsSync(join(custom, "config.yaml"))).toBe(true);
        expect(existsSync(configFile())).toBe(false);
    });

    it("expands a tilde in HERMES_HOME", () => {
        configureHermes(
            { home, env: { HERMES_HOME: "~/custom-hermes" } },
            settings,
        );
        expect(existsSync(join(home, "custom-hermes", "config.yaml"))).toBe(
            true,
        );
    });

    it("reports unconfigured when the credential is missing", () => {
        configureHermes(ctx, settings);
        unlinkSync(envFile());
        expect(hermes.status(ctx).configured).toBe(false);
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureHermes(ctx, settings);
        configureHermes(ctx, { ...settings, model: "kimi" });
        expect(hermes.status(ctx).model).toBe("kimi");

        disableHermes(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("stops before configuration when hermes is unavailable", async () => {
        await expect(hermes.on(ctx, {})).rejects.toThrow(
            "Hermes Agent was not found",
        );
        expect(existsSync(join(home, ".hermes"))).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
