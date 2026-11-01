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
import { parseEnv } from "node:util";
import { parse, stringify, type TomlTable } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HarnessContext } from "./types.js";
import { configureVibe, disableVibe, vibe, vibeHome } from "./vibe.js";

const MODEL = "example/coder";
const settings = {
    apiKey: "sk_vibe_test_fixture",
    model: MODEL,
    models: [
        { id: MODEL, contextWindow: 65536, input: ["text", "image"] },
        { id: "example/text", contextWindow: 32768, input: ["text"] },
    ],
};
let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-vibe-"));
    ctx = { home, env: {} };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(vibeHome(ctx), "config.toml");
const envFile = () => join(vibeHome(ctx), ".env");
const skillFile = () => join(vibeHome(ctx), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf8");
const config = () => parse(read(configFile()));
const writeConfig = (text: string) => {
    mkdirSync(vibeHome(ctx), { recursive: true });
    writeFileSync(configFile(), text);
};

describe("Mistral Vibe harness", () => {
    it("writes a native OpenAI provider, live model metadata, credential and skill", () => {
        expect(configureVibe(ctx, settings)).toMatchObject({
            harness: "vibe",
            configured: true,
            model: MODEL,
        });
        expect(config()).toMatchObject({
            active_model: `pollinations/${MODEL}`,
            utility_models: {
                title: `pollinations/${MODEL}`,
                smart_approve: `pollinations/${MODEL}`,
            },
            providers: [
                {
                    name: "pollinations",
                    api_base: "https://gen.pollinations.ai/v1",
                    api_style: "openai",
                    backend: "generic",
                    api_key_env_var: "POLLI_VIBE_API_KEY",
                },
            ],
            models: [
                {
                    name: MODEL,
                    provider: "pollinations",
                    alias: `pollinations/${MODEL}`,
                    max_context_length: 65536,
                    supports_images: true,
                },
                {
                    name: "example/text",
                    max_context_length: 32768,
                    supports_images: false,
                },
            ],
        });
        expect(read(configFile())).not.toContain(settings.apiKey);
        expect(parseEnv(read(envFile())).POLLI_VIBE_API_KEY).toBe(
            settings.apiKey,
        );
        expect(read(skillFile())).toContain("name: polli");
        expect(JSON.stringify(vibe.status(ctx))).not.toContain(settings.apiKey);
    });

    it("preserves unrelated providers, models and credentials and restores original bytes", () => {
        const original =
            '# my settings\nactive_model = "local"\n\n[[providers]]\nname = "ollama"\napi_base = "http://localhost:11434/v1"\n\n[[models]]\nname = "llama"\nprovider = "ollama"\nalias = "local"\n';
        writeConfig(original);
        const originalEnv = "# existing credentials\nOTHER_API_KEY=keep\n";
        writeFileSync(envFile(), originalEnv);
        configureVibe(ctx, settings);
        expect(config().providers).toContainEqual({
            name: "ollama",
            api_base: "http://localhost:11434/v1",
        });
        expect(config().models).toContainEqual({
            name: "llama",
            provider: "ollama",
            alias: "local",
        });
        expect(parseEnv(read(envFile())).OTHER_API_KEY).toBe("keep");
        // Repeated on must not replace the original backup or duplicate entries.
        configureVibe(ctx, settings);
        expect(config().providers).toHaveLength(2);
        expect(disableVibe(ctx).outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(read(envFile())).toBe(originalEnv);
        expect(existsSync(skillFile())).toBe(false);
    });

    it("strips only Pollinations after user edits and preserves their new selection and skill", () => {
        configureVibe(ctx, settings);
        const edited = config();
        edited.active_model = "local";
        edited.providers = [
            ...(edited.providers as TomlTable[]),
            { name: "local", api_base: "http://localhost:11434/v1" },
        ];
        edited.models = [
            ...(edited.models as TomlTable[]),
            { name: "llama", provider: "local", alias: "local" },
        ];
        edited.enable_notifications = false;
        edited.utility_models = {
            title: "local",
            smart_approve: `pollinations/${MODEL}`,
        };
        writeFileSync(configFile(), stringify(edited));
        writeFileSync(envFile(), `${read(envFile())}\nOTHER_KEY=keep\n`);
        writeFileSync(skillFile(), "user-edited skill");
        expect(disableVibe(ctx).outcome).toBe("stripped");
        expect(config()).toMatchObject({
            active_model: "local",
            enable_notifications: false,
        });
        expect(config().providers).toEqual([
            { name: "local", api_base: "http://localhost:11434/v1" },
        ]);
        expect(config().models).toEqual([
            { name: "llama", provider: "local", alias: "local" },
        ]);
        expect(parseEnv(read(envFile()))).toEqual({ OTHER_KEY: "keep" });
        expect(read(skillFile())).toBe("user-edited skill");
        expect(config().utility_models).toEqual({ title: "local" });
    });

    it("clears the managed default after edits and reports a missing key", () => {
        configureVibe(ctx, settings);
        writeFileSync(envFile(), "OTHER_KEY=keep\n");
        expect(vibe.status(ctx).configured).toBe(false);
        expect(disableVibe(ctx).outcome).toBe("stripped");
        expect(config().active_model).toBeUndefined();
        expect(config().utility_models).toBeUndefined();
    });

    it("does not overwrite a foreign same-name provider or model alias", () => {
        for (const original of [
            '[[providers]]\nname = "pollinations"\napi_base = "https://example.com/v1"\n',
            `[[models]]\nname = "other"\nprovider = "other"\nalias = "pollinations/${MODEL}"\n`,
        ]) {
            writeConfig(original);
            expect(() => configureVibe(ctx, settings)).toThrow(
                "leaving it unchanged",
            );
            expect(read(configFile())).toBe(original);
            expect(existsSync(envFile())).toBe(false);
        }
    });

    it("leaves a repurposed provider and its credentials unchanged", () => {
        configureVibe(ctx, settings);
        writeFileSync(
            configFile(),
            read(configFile()).replace(
                "https://gen.pollinations.ai/v1",
                "https://example.com/v1",
            ),
        );
        const edited = read(configFile());
        expect(vibe.status(ctx).configured).toBe(false);
        expect(disableVibe(ctx).outcome).toBe("unchanged");
        expect(read(configFile())).toBe(edited);
        expect(parseEnv(read(envFile())).POLLI_VIBE_API_KEY).toBe(
            settings.apiKey,
        );
    });

    it("fails safely on invalid TOML without leaking parser excerpts", () => {
        const original = 'secret = "private_fixture"\nproviders = [broken';
        writeConfig(original);
        expect(() => configureVibe(ctx, settings)).toThrow("Cannot parse");
        expect(() => configureVibe(ctx, settings)).not.toThrow(
            "private_fixture",
        );
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
    });

    it("honors VIBE_HOME including tilde and keeps backups separate", () => {
        configureVibe(ctx, settings);
        const customCtx = { home, env: { VIBE_HOME: "~/custom-vibe" } };
        configureVibe(customCtx, settings);
        expect(vibeHome(customCtx)).toBe(join(home, "custom-vibe"));
        expect(existsSync(join(home, "custom-vibe", "config.toml"))).toBe(true);
        disableVibe(customCtx);
        expect(existsSync(join(home, "custom-vibe", "config.toml"))).toBe(
            false,
        );
        expect(vibe.status(ctx).configured).toBe(true);
    });

    it("does not replace an existing Polli skill and removes fresh setup on off", () => {
        mkdirSync(join(vibeHome(ctx), "skills", "polli"), { recursive: true });
        writeFileSync(skillFile(), "existing user skill");
        configureVibe(ctx, settings);
        expect(read(skillFile())).toBe("existing user skill");
        expect(disableVibe(ctx).outcome).toBe("restored");
        expect(existsSync(configFile())).toBe(false);
        expect(existsSync(envFile())).toBe(false);
        expect(read(skillFile())).toBe("existing user skill");
    });

    it("stops before login or configuration if Vibe is unavailable", async () => {
        await expect(vibe.on(ctx, {})).rejects.toThrow(
            "Mistral Vibe was not found",
        );
        expect(existsSync(vibeHome(ctx))).toBe(false);
        expect(disableVibe(ctx).outcome).toBe("unchanged");
    });
});
