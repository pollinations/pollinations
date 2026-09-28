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
import { configureHermes, disableHermes, hermes } from "./hermes.js";
import type { HarnessContext } from "./types.js";

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-hermes-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".hermes", "config.yaml");
const read = () => readFileSync(configFile(), "utf-8");
const settings = { apiKey: "sk_test_key", model: "openai" };

describe("hermes harness", () => {
    it("configures the custom provider and MCP server", () => {
        expect(configureHermes(ctx, settings)).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "openai",
            mcp: true,
        });
        expect(parse(read())).toMatchObject({
            model: {
                provider: "custom",
                base_url: "https://gen.pollinations.ai/v1",
                api_key: "sk_test_key",
                default: "openai",
            },
            mcp_servers: {
                pollinations: {
                    url: "https://gen.pollinations.ai/mcp/pollinations",
                    headers: { Authorization: "Bearer sk_test_key" },
                },
            },
        });
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
    });

    it("keeps unrelated settings and comments", () => {
        mkdirSync(join(home, ".hermes"));
        writeFileSync(
            configFile(),
            "# mine\nmodel:\n  provider: openrouter\n  context_length: 1000\nagent:\n  max_turns: 5\n",
        );
        configureHermes(ctx, { ...settings, mcp: false });
        expect(read()).toContain("# mine");
        expect(parse(read())).toMatchObject({
            model: { provider: "custom", context_length: 1000 },
            agent: { max_turns: 5 },
        });
        expect(parse(read()).mcp_servers).toBeUndefined();
    });

    it("restores the original file on off", () => {
        mkdirSync(join(home, ".hermes"));
        const original = "model:\n  provider: openrouter\n";
        writeFileSync(configFile(), original);
        configureHermes(ctx, settings);
        expect(disableHermes(ctx).outcome).toBe("restored");
        expect(read()).toBe(original);
    });

    it("strips only managed values when the file changed after on", () => {
        configureHermes(ctx, settings);
        writeFileSync(configFile(), `${read()}agent:\n  max_turns: 5\n`);
        expect(disableHermes(ctx).outcome).toBe("stripped");
        expect(parse(read())).toEqual({
            model: {},
            mcp_servers: {},
            agent: { max_turns: 5 },
        });
    });

    it("honors HERMES_HOME", () => {
        ctx.env.HERMES_HOME = join(home, "profile");
        configureHermes(ctx, settings);
        expect(existsSync(join(home, "profile", "config.yaml"))).toBe(true);
    });

    it("stops before configuration when hermes is unavailable", async () => {
        await expect(hermes.on(ctx, {})).rejects.toThrow("hermes was not found");
        expect(existsSync(configFile())).toBe(false);
    });
});
