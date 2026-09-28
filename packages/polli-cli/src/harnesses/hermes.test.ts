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
import { parse } from "yaml";
import {
    configureHermes,
    disableHermes,
    existingHermesKey,
    hermes,
    hermesResult,
    withoutPollinationsProvider,
    withPollinationsProvider,
} from "./hermes.js";
import type { HarnessContext } from "./types.js";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-harness-"));
    // HERMES_HOME keeps the test off the machine's real Hermes config.
    ctx = { home, env: { HERMES_HOME: join(home, "hermes-home") } };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, "hermes-home", "config.yaml");
const read = () => parse(readFileSync(configFile(), "utf-8"));
const write = (text: string) => {
    mkdirSync(join(home, "hermes-home"), { recursive: true });
    writeFileSync(configFile(), text);
};
const pollinationsEntry = (config: ReturnType<typeof read>) =>
    (config.custom_providers as Record<string, unknown>[]).find(
        (entry) => entry.name === "gen.pollinations.ai",
    );

describe("hermes harness", () => {
    it("adds a Pollinations provider without a hardcoded catalog", () => {
        expect(
            configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", [
                "openai/gpt-oss-20b",
                "amazon/nova-micro-v1",
            ]),
        ).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "openai/gpt-oss-20b",
            installed: true,
        });

        expect(pollinationsEntry(read())).toMatchObject({
            name: "gen.pollinations.ai",
            base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_test_key",
            model: "openai/gpt-oss-20b",
            api_mode: "chat_completions",
            models: ["openai/gpt-oss-20b", "amazon/nova-micro-v1"],
        });
        // Hermes' own generation tools read this section.
        expect(read().pollinations).toMatchObject({ api_key: "sk_test_key" });
        if (process.platform !== "win32") {
            expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        }
    });

    it("preserves other providers, keys and sections", () => {
        write(
            [
                "model: keep-me",
                "custom_providers:",
                "  - name: Api.example.cn",
                "    base_url: https://api.example.cn/v1",
                "    api_key: other-key",
                "    model: some-model",
                "mcp_servers:",
                "  clawlink:",
                "    enabled: true",
                "",
            ].join("\n"),
        );
        configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", []);
        const config = read();

        expect(config.model).toBe("keep-me");
        expect(config.mcp_servers).toMatchObject({
            clawlink: { enabled: true },
        });
        const providers = config.custom_providers as Record<string, unknown>[];
        expect(providers).toHaveLength(2);
        expect(
            providers.find((p) => p.name === "Api.example.cn"),
        ).toMatchObject({
            api_key: "other-key",
        });
    });

    it("replaces an existing Pollinations entry instead of duplicating it", () => {
        configureHermes(ctx, "sk_first", "openai/gpt-oss-20b", []);
        configureHermes(ctx, "sk_second", "amazon/nova-micro-v1", []);
        const providers = read().custom_providers as Record<string, unknown>[];
        expect(
            providers.filter((p) => p.name === "gen.pollinations.ai"),
        ).toHaveLength(1);
        expect(pollinationsEntry(read())).toMatchObject({
            api_key: "sk_second",
            model: "amazon/nova-micro-v1",
        });
    });

    it("reuses the stored key, preferring the provider entry", () => {
        write("pollinations:\n  api_key: sk_from_section\n");
        expect(existingHermesKey(ctx)).toBe("sk_from_section");
        configureHermes(ctx, "sk_from_provider", "openai/gpt-oss-20b", []);
        expect(existingHermesKey(ctx)).toBe("sk_from_provider");
    });

    it("restores the original file on off", () => {
        const original = "model: keep-me\ncustom_providers: []\n";
        write(original);
        configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", []);
        expect(disableHermes(ctx).outcome).toBe("restored");
        expect(readFileSync(configFile(), "utf-8")).toBe(original);
    });

    it("strips only its own entries when the config changed after on", () => {
        configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", []);
        write(
            `${readFileSync(configFile(), "utf-8")}reasoning:\n  effort: high\n`,
        );
        expect(disableHermes(ctx).outcome).toBe("stripped");
        const config = read();
        expect(config.reasoning).toMatchObject({ effort: "high" });
        expect(config.custom_providers).toBeUndefined();
        expect(config.pollinations).toBeUndefined();
    });

    it("leaves other providers in place when stripping", () => {
        write(
            "custom_providers:\n  - name: Api.example.cn\n    api_key: keep\n",
        );
        configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", []);
        // Edit after `on`, so `off` takes the strip path rather than restoring.
        write(
            `${readFileSync(configFile(), "utf-8")}reasoning:\n  effort: high\n`,
        );
        expect(disableHermes(ctx).outcome).toBe("stripped");
        const providers = read().custom_providers as Record<string, unknown>[];
        expect(providers).toHaveLength(1);
        expect(providers[0]).toMatchObject({ name: "Api.example.cn" });
    });

    it("reports install state and configuration separately", () => {
        expect(hermesResult(ctx)).toMatchObject({
            harness: "hermes",
            configured: false,
            installed: false,
        });
        write("model: keep-me\n");
        expect(hermesResult(ctx)).toMatchObject({
            configured: false,
            installed: true,
        });
        configureHermes(ctx, "sk_test_key", "openai/gpt-oss-20b", []);
        expect(hermesResult(ctx)).toMatchObject({
            configured: true,
            installed: true,
            model: "openai/gpt-oss-20b",
        });
    });

    it("stops before configuration when Hermes is unavailable", async () => {
        ctx = { home, env: {} };
        await expect(hermes.on(ctx, {})).rejects.toThrow(
            "Hermes Agent was not found",
        );
        expect(existsSync(configFile())).toBe(false);
    });

    it("keeps the provider helpers pure for the adapter to compose", () => {
        const base = { model: "keep", custom_providers: [{ name: "other" }] };
        const added = withPollinationsProvider(base, "sk", "m", ["m"]);
        expect(base.custom_providers).toHaveLength(1);
        expect(added.custom_providers).toHaveLength(2);
        expect(withoutPollinationsProvider(added).custom_providers).toEqual([
            { name: "other" },
        ]);
    });
});
