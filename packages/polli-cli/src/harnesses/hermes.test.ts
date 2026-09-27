import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { configureHermes, disableHermes, hermes } from "./hermes.js";
import type { HarnessContext } from "./types.js";

const settings = { apiKey: "sk_test_key", model: "qwen", mcp: true };

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
    it("writes the provider, model, key, skill, and MCP server from scratch", () => {
        const result = configureHermes(ctx, settings);
        expect(result).toMatchObject({
            harness: "hermes",
            label: "Hermes Agent",
            configured: true,
            model: "qwen",
        });

        const doc = parse(read(configFile()));
        expect(doc.providers.pollinations).toEqual({
            name: "Pollinations",
            api: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
        });
        expect(doc.model).toEqual({
            provider: "pollinations",
            default: "qwen",
        });
        expect(doc.mcp_servers.pollinations).toMatchObject({
            url: "https://gen.pollinations.ai/mcp/pollinations",
        });
        expect(doc.mcp_servers.pollinations.headers.Authorization).toContain(
            "POLLI_HERMES_API_KEY",
        );

        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBe(
            "sk_test_key",
        );
        expect(read(skillFile())).toContain("polli");
    });

    it("preserves other providers, models, and MCP servers", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            [
                "mcp_servers:",
                "  friend:",
                "    url: https://friend.example/mcp",
                "providers:",
                "  openai:",
                "    name: OpenAI",
                "    api: https://api.openai.com/v1",
                "model:",
                "  default: gpt-5",
                "  provider: openai",
                "",
            ].join("\n"),
        );
        configureHermes(ctx, settings);

        const doc = parse(read(configFile()));
        expect(doc.providers.openai).toMatchObject({ name: "OpenAI" });
        expect(doc.mcp_servers.friend.url).toBe("https://friend.example/mcp");
        expect(doc.providers.pollinations.name).toBe("Pollinations");
    });

    it("omits the MCP server when mcp is false", () => {
        configureHermes(ctx, { ...settings, mcp: false });
        const doc = parse(read(configFile()));
        expect(doc.mcp_servers).toBeUndefined();
    });

    it("restores untouched files byte-for-byte on off", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(configFile(), "model:\n  default: keep\n");
        const before = read(configFile());
        configureHermes(ctx, settings);
        const result = disableHermes(ctx);
        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(before);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toEqual([]);
    });

    it("strips only Pollinations entries after outside edits", () => {
        configureHermes(ctx, settings);
        const doc = parse(read(configFile()));
        doc.providers.friend = { name: "Friend", api: "https://f.example/v1" };
        writeFileSync(configFile(), JSON.stringify(doc, null, 2));

        const result = disableHermes(ctx);
        expect(result.outcome).toBe("stripped");
        const after = parse(read(configFile()));
        expect(after.providers.friend).toMatchObject({ name: "Friend" });
        expect(after.providers?.pollinations).toBeUndefined();
    });

    it("reports an unconfigured status before on", async () => {
        expect((await hermes.status(ctx)).configured).toBe(false);
    });
});
