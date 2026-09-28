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
    hermesConfigPath,
    hermesEnvPath,
    hermesMcpClient,
    hermesSkillPath,
} from "./hermes.js";
import type { HarnessContext } from "./types.js";

const server = {
    id: "memory",
    name: "Memory",
    url: "https://gen.pollinations.ai/mcp/memory",
};

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-"));
    ctx = { home, env: { HERMES_HOME: "~/.hermes" } };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const read = (path: string) => readFileSync(path, "utf-8");

describe("Hermes harness", () => {
    it("writes a custom Pollinations model, key, skill, and MCP server", async () => {
        const result = await configureHermes(
            ctx,
            {
                apiKey: "sk_test_key",
                model: "deepseek/deepseek-v4-flash",
            },
            [server],
        );

        expect(result).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "deepseek/deepseek-v4-flash",
            mcp: true,
        });

        const config = parse(read(hermesConfigPath(ctx)));
        expect(config.model).toMatchObject({
            provider: "custom",
            default: "deepseek/deepseek-v4-flash",
            base_url: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
            api_mode: "chat_completions",
        });
        expect(config.mcp_servers.memory).toMatchObject({
            url: server.url,
            headers: { Authorization: "Bearer sk_test_key" },
        });
        expect(parseEnv(read(hermesEnvPath(ctx))).POLLI_HERMES_API_KEY).toBe(
            "sk_test_key",
        );
        expect(read(hermesSkillPath(ctx))).toContain("name: polli");
    });

    it("preserves unrelated Hermes configuration and skips MCP when requested", async () => {
        const configPath = hermesConfigPath(ctx);
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configPath,
            "# keep this comment\nmodel:\n  provider: openrouter\n  default: existing\nui:\n  theme: dark\n",
        );

        const result = await configureHermes(
            ctx,
            {
                apiKey: "sk_test_key",
                model: "kimi",
                mcp: false,
            },
            [],
        );

        const config = parse(read(configPath));
        expect(result.mcp).toBe(false);
        expect(config.ui.theme).toBe("dark");
        expect(config.model.provider).toBe("custom");
        expect(config.mcp_servers).toBeUndefined();
    });

    it("restores files byte-for-byte on off when untouched", async () => {
        const configPath = hermesConfigPath(ctx);
        const original = "model: { provider: openrouter, default: existing }\n";
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(configPath, original);

        await configureHermes(
            ctx,
            {
                apiKey: "sk_test_key",
                model: "kimi",
            },
            [server],
        );
        const result = disableHermes(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configPath)).toBe(original);
        expect(existsSync(hermesEnvPath(ctx))).toBe(false);
        expect(existsSync(hermesSkillPath(ctx))).toBe(false);
    });

    it("supports polli mcp install and remove for Hermes", () => {
        const installed = hermesMcpClient.install(ctx, [server], "sk_test_key");
        expect(installed.installed).toEqual(["memory"]);
        expect(hermesMcpClient.existingKey?.(ctx)).toBe("sk_test_key");

        const removed = hermesMcpClient.remove(ctx, ["memory"]);
        expect(removed.removed).toEqual(["memory"]);
        expect(hermesMcpClient.status(ctx).installed).toEqual([]);
    });

    it("reports that Hermes must be installed before on", async () => {
        await expect(
            hermes.on(ctx, { model: "kimi", browser: false }),
        ).rejects.toThrow("Hermes Agent was not found");
    });
});
