import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
    configureHermes,
    disableHermes,
    hermes,
    hermesHome,
} from "./hermes.js";
import type { HarnessContext } from "./types.js";

const MODEL = "deepseek/deepseek-v4-flash";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(hermesHome(ctx), "config.yaml");
const envFile = () => join(hermesHome(ctx), ".env");
const skillFile = () => join(hermesHome(ctx), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("hermes harness", () => {
    it("keeps unrelated model settings and a provider selected after setup", () => {
        mkdirSync(hermesHome(ctx), { recursive: true });
        writeFileSync(
            configFile(),
            stringify({
                model: {
                    provider: "other",
                    default: "old",
                    context_length: 8192,
                },
            }),
        );
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        const config = parse(read(configFile()));
        expect(config.model.context_length).toBe(8192);
        config.model.provider = "other";
        config.model.default = "user-selected";
        writeFileSync(configFile(), stringify(config));
        disableHermes(ctx);
        expect(parse(read(configFile())).model).toEqual({
            provider: "other",
            default: "user-selected",
            context_length: 8192,
        });
    });

    it("does not overwrite a different same-name provider", () => {
        mkdirSync(hermesHome(ctx), { recursive: true });
        const original =
            "providers:\n  pollinations:\n    api: https://example.com/v1\n";
        writeFileSync(configFile(), original);
        expect(() =>
            configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL }),
        ).toThrow("different settings");
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
    });

    it("leaves a repurposed provider alone and reports it unconfigured", () => {
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        const config = parse(read(configFile()));
        config.providers.pollinations.api = "https://example.com/v1";
        writeFileSync(configFile(), stringify(config));
        expect(hermes.status(ctx).configured).toBe(false);
        disableHermes(ctx);
        expect(parse(read(configFile())).providers.pollinations.api).toBe(
            "https://example.com/v1",
        );
        expect(read(envFile())).toContain("sk_test_key");
    });

    it("preserves added provider settings during repeated setup and cleanup", () => {
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        const config = parse(read(configFile()));
        config.providers.pollinations.extra_headers = { "X-Custom": "keep" };
        writeFileSync(configFile(), stringify(config));
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        expect(
            parse(read(configFile())).providers.pollinations.extra_headers,
        ).toEqual({ "X-Custom": "keep" });
        writeFileSync(configFile(), `${read(configFile())}\n# edited\n`);
        disableHermes(ctx);
        expect(
            parse(read(configFile())).providers.pollinations.extra_headers,
        ).toEqual({ "X-Custom": "keep" });
    });
    it("writes the provider, key, default model, and skill from scratch", () => {
        const result = configureHermes(ctx, {
            apiKey: "sk_test_key",
            model: MODEL,
        });
        expect(result).toMatchObject({
            harness: "hermes",
            configured: true,
            model: MODEL,
        });

        const doc = parse(read(configFile()));
        expect(doc.providers.pollinations).toEqual({
            name: "Pollinations",
            api: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
        });
        expect(doc.model).toEqual({ provider: "pollinations", default: MODEL });
        expect(read(envFile())).toContain('POLLI_HERMES_API_KEY="sk_test_key"');
        expect(read(skillFile())).toContain("name: polli");
        expect(hermes.status(ctx)).toMatchObject({
            configured: true,
            model: MODEL,
        });
    });

    it("keeps existing providers, comments, and unrelated config", () => {
        mkdirSync(hermesHome(ctx), { recursive: true });
        writeFileSync(
            configFile(),
            [
                "# keep this comment",
                "providers:",
                "  ollama:",
                "    api: http://localhost:11434/v1",
                "model:",
                "  provider: ollama",
                "  default: llama3.1:8b",
                "channels:",
                "  discord:",
                "    enabled: true",
                "",
            ].join("\n"),
        );

        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });

        const text = read(configFile());
        expect(text).toContain("# keep this comment");
        const doc = parse(text);
        expect(doc.providers.ollama.api).toBe("http://localhost:11434/v1");
        expect(doc.channels.discord.enabled).toBe(true);
        expect(doc.model.provider).toBe("pollinations");
    });

    it("restores the original config byte-for-byte on off", () => {
        mkdirSync(hermesHome(ctx), { recursive: true });
        const original = "model:\n  provider: ollama\n  default: llama3.1:8b\n";
        writeFileSync(configFile(), original);

        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        const result = disableHermes(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(existsSync(join(hermesHome(ctx), "skills", "polli"))).toBe(
            false,
        );
        expect(hermes.status(ctx)).toMatchObject({ configured: false });
    });

    it("only strips Pollinations entries when files changed since on", () => {
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        const edited = parse(read(configFile()));
        edited.model = { provider: "openai-api", default: "gpt-5" };
        edited.providers.ollama = { api: "http://localhost:11434/v1" };
        edited.channels = { discord: { enabled: true } };
        writeFileSync(configFile(), stringify(edited));

        const result = disableHermes(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = parse(read(configFile()));
        expect(doc.providers.pollinations).toBeUndefined();
        expect(doc.providers.ollama.api).toBe("http://localhost:11434/v1");
        expect(doc.channels.discord.enabled).toBe(true);
        // The user's new provider and default survive.
        expect(doc.model).toEqual({ provider: "openai-api", default: "gpt-5" });
        expect(read(envFile())).not.toContain("POLLI_HERMES_API_KEY");
        expect(existsSync(skillFile())).toBe(false);
        expect(existsSync(join(hermesHome(ctx), "skills", "polli"))).toBe(
            false,
        );
    });

    it("reports unchanged when off runs before on", () => {
        expect(disableHermes(ctx).outcome).toBe("unchanged");
    });

    it("honors HERMES_HOME", () => {
        const custom = join(home, "custom-hermes");
        const customCtx: HarnessContext = {
            home,
            env: { HERMES_HOME: custom },
        };
        configureHermes(customCtx, { apiKey: "sk_test_key", model: MODEL });
        expect(existsSync(join(custom, "config.yaml"))).toBe(true);
        expect(existsSync(join(custom, "skills", "polli", "SKILL.md"))).toBe(
            true,
        );
        expect(existsSync(configFile())).toBe(false);
    });

    it("reports unconfigured when the credential is missing", () => {
        configureHermes(ctx, { apiKey: "sk_test_key", model: MODEL });
        writeFileSync(envFile(), "\n");
        expect(hermes.status(ctx)).toMatchObject({ configured: false });
    });

    it("stops before configuration when Hermes is unavailable", async () => {
        await expect(hermes.on(ctx, {})).rejects.toThrow(
            "Hermes Agent was not found",
        );
        expect(existsSync(hermesHome(ctx))).toBe(false);
    });
});
