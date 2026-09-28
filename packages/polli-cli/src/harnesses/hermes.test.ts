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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
    configureHermes,
    disableHermes,
    hermes,
    hermesHome,
} from "./hermes.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-"));
    ctx = { home, env: { HERMES_HOME: join(home, "hermes-home") } };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, "hermes-home", "config.yaml");
const envFile = () => join(home, "hermes-home", ".env");
const skillFile = () =>
    join(home, "hermes-home", "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");

describe("hermes harness", () => {
    it("registers Pollinations as a named custom provider with the key in .env", () => {
        const result = configureHermes(ctx, models, "sk_test", "deepseek");
        expect(result).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "deepseek",
        });

        const config = parse(read(configFile()));
        expect(config.providers.pollinations).toEqual({
            api: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
            models: {
                deepseek: { context_length: 1048576 },
                kimi: { context_length: 262000, supports_vision: true },
            },
        });
        // Named custom providers are selected as custom:<name>.
        expect(config.model).toEqual({
            default: "deepseek",
            provider: "custom:pollinations",
        });
        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBe("sk_test");
        expect(read(skillFile())).toContain("name: polli");
        expect(hermes.status(ctx).configured).toBe(true);
    });

    it("keeps other providers, settings, comments, and env entries", () => {
        mkdirSync(join(home, "hermes-home"), { recursive: true });
        writeFileSync(
            configFile(),
            "# my notes\nproviders:\n  together:\n    api: https://api.together.xyz/v1\n    key_env: TOGETHER_API_KEY\nmemory:\n  enabled: true\nmodel:\n  default: gpt\n  provider: openai-api\n",
        );
        writeFileSync(envFile(), "TOGETHER_API_KEY=tg-secret\n");

        configureHermes(ctx, models, "sk_test", "deepseek");

        const text = read(configFile());
        expect(text).toContain("# my notes");
        const config = parse(text);
        expect(config.providers.together.key_env).toBe("TOGETHER_API_KEY");
        expect(config.memory).toEqual({ enabled: true });
        expect(parseEnv(read(envFile()))).toMatchObject({
            TOGETHER_API_KEY: "tg-secret",
            POLLI_HERMES_API_KEY: "sk_test",
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, "hermes-home"), { recursive: true });
        const original = "model:\n  default: gpt\n  provider: openai-api\n";
        writeFileSync(configFile(), original);

        configureHermes(ctx, models, "sk_test", "deepseek");
        const result = disableHermes(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(hermes.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when the config changed since on", () => {
        mkdirSync(join(home, "hermes-home"), { recursive: true });
        writeFileSync(configFile(), "memory:\n  enabled: true\n");
        configureHermes(ctx, models, "sk_test", "deepseek");
        writeFileSync(
            configFile(),
            `${read(configFile())}display:\n  bell: true\n`,
        );

        const result = disableHermes(ctx);

        expect(result.outcome).toBe("stripped");
        const config = parse(read(configFile()));
        expect(config).toEqual({
            memory: { enabled: true },
            display: { bell: true },
        });
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
    });

    it("leaves a default model the user switched away from", () => {
        configureHermes(ctx, models, "sk_test", "deepseek");
        writeFileSync(
            configFile(),
            read(configFile()).replace(
                "provider: custom:pollinations",
                "provider: openai-api",
            ),
        );

        disableHermes(ctx);

        expect(parse(read(configFile())).model.provider).toBe("openai-api");
    });

    it("resolves the Hermes home like Hermes does", () => {
        expect(hermesHome(ctx)).toBe(join(home, "hermes-home"));
        const bare = { home, env: {} };
        expect(hermesHome(bare)).toBe(
            process.platform === "win32"
                ? join(home, "AppData", "Local", "hermes")
                : join(home, ".hermes"),
        );
    });

    it("fails before touching anything when Hermes is missing", async () => {
        await expect(
            hermes.on({ home, env: { PATH: "" } }, {}),
        ).rejects.toThrow("Hermes Agent was not found");
    });
});
