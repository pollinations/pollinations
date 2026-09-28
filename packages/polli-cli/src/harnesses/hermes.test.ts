import { createHash } from "node:crypto";
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
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { findClient } from "../mcp/clients.js";
import { configureHermes, disableHermes, hermes } from "./hermes.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "deepseek", models };

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
const stateFile = () => {
    const dir = join(home, ".pollinations", "harnesses");
    if (!existsSync(dir)) return null;
    const found = readdirSync(dir).filter((f) =>
        f.startsWith("hermes.written."),
    );
    return found.length === 1 ? join(dir, found[0]) : null;
};
const read = (path: string) => readFileSync(path, "utf-8");
const readState = () => {
    const path = stateFile();
    if (!path) throw new Error("written-state file missing");
    return JSON.parse(read(path)) as {
        model: string;
        models: string[];
        keyHash: string;
    };
};
const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");
const fileHashes = () =>
    Object.fromEntries(
        [configFile(), envFile(), skillFile()]
            .filter((path) => existsSync(path))
            .map((path) => [path, sha256(read(path))]),
    );

const mcpServer = {
    id: "pollinations",
    name: "Pollinations",
    url: "https://gen.pollinations.ai/mcp/pollinations",
};

describe("hermes harness", () => {
    it("writes the provider, model, credential, and skill from scratch", async () => {
        const result = configureHermes(ctx, settings);
        expect(result).toMatchObject({
            harness: "hermes",
            configured: true,
            model: "deepseek",
            mcp: false,
        });

        // Block-style YAML, never a flow-style one-liner.
        expect(read(configFile())).toContain(
            "providers:\n  pollinations:\n    name: Pollinations\n    base_url: https://gen.pollinations.ai/v1\n",
        );
        const doc = parse(read(configFile()));
        expect(doc.providers.pollinations).toEqual({
            name: "Pollinations",
            base_url: "https://gen.pollinations.ai/v1",
            key_env: "POLLI_HERMES_API_KEY",
            models: ["deepseek", "kimi"],
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
        expect(await hermes.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
        const state = readState();
        expect(state.model).toBe("deepseek");
        expect(state.models).toEqual(["deepseek", "kimi"]);
        expect(state.keyHash).toBe(sha256("sk_test_key"));
        expect(JSON.stringify(state)).not.toContain("sk_test_key");
    });

    it("keeps existing config, comments, env lines, and skills", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "# my notes\nproviders:\n  anthropic:\n    name: Anthropic\n    base_url: https://api.anthropic.com\nmodel:\n  provider: anthropic\n  default: claude-opus\nfallbacks: [openai]\n",
        );
        writeFileSync(envFile(), "# local env\nANTHROPIC_API_KEY=sk-ant\n");
        mkdirSync(join(home, ".hermes", "skills", "polli"), {
            recursive: true,
        });
        writeFileSync(skillFile(), "# my customized skill\n");

        configureHermes(ctx, settings);

        const text = read(configFile());
        expect(text).toContain("# my notes");
        const doc = parse(text);
        expect(doc.providers.anthropic).toEqual({
            name: "Anthropic",
            base_url: "https://api.anthropic.com",
        });
        expect(doc.fallbacks).toEqual(["openai"]);
        expect(doc.model).toEqual({
            provider: "pollinations",
            default: "deepseek",
        });
        expect(parseEnv(read(envFile()))).toMatchObject({
            ANTHROPIC_API_KEY: "sk-ant",
            POLLI_HERMES_API_KEY: "sk_test_key",
        });
        expect(read(envFile())).toContain("# local env");
        // A user-edited skill file is never overwritten.
        expect(read(skillFile())).toBe("# my customized skill\n");
    });

    it("honors HERMES_HOME for all owned files", () => {
        const elsewhere = join(home, "custom-hermes");
        const customCtx: HarnessContext = {
            home,
            env: { HERMES_HOME: elsewhere },
        };
        const result = configureHermes(customCtx, settings);
        expect(result.configured).toBe(true);
        expect(existsSync(join(elsewhere, "config.yaml"))).toBe(true);
        expect(existsSync(join(elsewhere, ".env"))).toBe(true);
        expect(existsSync(join(elsewhere, "skills", "polli", "SKILL.md"))).toBe(
            true,
        );
        expect(existsSync(configFile())).toBe(false);
    });

    it("re-on switches the model and keeps the rest intact", () => {
        configureHermes(ctx, settings);
        const result = configureHermes(ctx, {
            ...settings,
            model: "kimi",
        });
        expect(result.model).toBe("kimi");
        const doc = parse(read(configFile()));
        expect(doc.model).toEqual({
            provider: "pollinations",
            default: "kimi",
        });
        expect(doc.providers.pollinations.models).toEqual(["deepseek", "kimi"]);
        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBe(
            "sk_test_key",
        );
        expect(readState().model).toBe("kimi");
    });

    it("refuses to overwrite a foreign providers.pollinations entry", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        const original =
            "providers:\n  pollinations:\n    name: My Proxy\n    base_url: https://example.com/v1\n";
        writeFileSync(configFile(), original);

        expect(() => configureHermes(ctx, settings)).toThrow(
            /providers\.pollinations/,
        );
        expect(read(configFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
    });

    it("rejects a malformed config instead of rewriting it", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        const broken = "providers:\n  pollinations: [unclosed\n";
        writeFileSync(configFile(), broken);
        expect(() => configureHermes(ctx, settings)).toThrow(/not valid YAML/);
        expect(read(configFile())).toBe(broken);
    });

    it("off restores byte-identical files when nothing was touched", async () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "# keep me\nproviders:\n  anthropic:\n    name: Anthropic\n",
        );
        writeFileSync(envFile(), "ANTHROPIC_API_KEY=sk-ant\n");
        const before = fileHashes();

        configureHermes(ctx, settings);
        const result = disableHermes(ctx);

        expect(result.outcome).toBe("restored");
        expect(fileHashes()).toEqual(before);
        expect(existsSync(skillFile())).toBe(false);
        expect(stateFile()).toBeNull();
        expect((await hermes.status(ctx)).configured).toBe(false);
    });

    it("off on a fresh install removes the files it created", () => {
        configureHermes(ctx, settings);
        const result = disableHermes(ctx);
        expect(result.outcome).toBe("restored");
        expect(existsSync(configFile())).toBe(false);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
    });

    it("strips only Pollinations-owned fields after user edits", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "providers:\n  anthropic:\n    name: Anthropic\n",
        );
        configureHermes(ctx, settings);

        // The user edits the config after `on`: a comment, a new provider,
        // and an extra field inside our provider entry.
        const doc = parse(read(configFile()));
        doc.providers.pollinations.custom_flag = true;
        writeFileSync(
            configFile(),
            `# user note\n${JSON.stringify(doc, null, 2)}\n`,
        );

        const result = disableHermes(ctx);
        expect(result.outcome).toBe("stripped");

        const text = read(configFile());
        expect(text).toContain("# user note");
        const after = parse(text);
        expect(after.providers.anthropic).toEqual({ name: "Anthropic" });
        // Our owned fields are gone; the user's addition to the entry stays.
        expect(after.providers.pollinations).toEqual({ custom_flag: true });
        expect(after.model).toBeUndefined();
    });

    it("restores a displaced model.provider from the snapshot on strip", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "model:\n  provider: anthropic\n  default: claude-opus\n",
        );
        configureHermes(ctx, settings);
        // User edits the file after `on`, so byte-restore no longer applies.
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        const result = disableHermes(ctx);
        expect(result.outcome).toBe("stripped");
        const after = parse(read(configFile()));
        expect(after.model).toEqual({
            provider: "anthropic",
            default: "claude-opus",
        });
        expect(read(configFile())).toContain("# touched");
    });

    it("keeps a user-changed model.default on strip", () => {
        configureHermes(ctx, settings);
        const doc = parse(read(configFile()));
        doc.model.default = "user-picked-model";
        writeFileSync(configFile(), `${JSON.stringify(doc, null, 2)}\n`);

        disableHermes(ctx);
        const after = parse(read(configFile()));
        expect(after.model).toEqual({ default: "user-picked-model" });
    });

    it("restores a pre-existing same-URL provider entry instead of deleting it", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "providers:\n  pollinations:\n    name: My Pollinations\n    base_url: https://gen.pollinations.ai/v1\n    api_key: sk_manual\n",
        );
        configureHermes(ctx, settings);
        // Force the strip path with an unrelated edit.
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        const after = parse(read(configFile()));
        expect(after.providers.pollinations).toEqual({
            name: "My Pollinations",
            base_url: "https://gen.pollinations.ai/v1",
            api_key: "sk_manual",
        });
    });

    it("keeps a user-rotated key in .env on strip", () => {
        configureHermes(ctx, settings);
        // The user rotates the key by hand after `on`.
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_user_rotated\n");
        // and touches the config so restore cannot apply byte-for-byte.
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(parseEnv(read(envFile())).POLLI_HERMES_API_KEY).toBe(
            "sk_user_rotated",
        );
    });

    it("removes our key line on strip while keeping other env entries", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(envFile(), "ANTHROPIC_API_KEY=sk-ant\n");
        configureHermes(ctx, settings);
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        const env = parseEnv(read(envFile()));
        expect(env.ANTHROPIC_API_KEY).toBe("sk-ant");
        expect(env.POLLI_HERMES_API_KEY).toBeUndefined();
    });

    it("status reports not-configured on a fresh home and survives broken YAML", async () => {
        expect(await hermes.status(ctx)).toMatchObject({
            harness: "hermes",
            configured: false,
            mcp: false,
        });
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(configFile(), "providers: [broken\n");
        expect((await hermes.status(ctx)).configured).toBe(false);
    });

    it("status reports a partial setup as not configured", async () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "providers:\n  pollinations:\n    name: Pollinations\n    base_url: https://gen.pollinations.ai/v1\n    key_env: POLLI_HERMES_API_KEY\nmodel:\n  provider: pollinations\n  default: deepseek\n",
        );
        // No key in .env, no skill file.
        const result = await hermes.status(ctx);
        expect(result.configured).toBe(false);
        expect(result.model).toBe("deepseek");
    });
    it("restores model.default when only model.provider was edited back", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "model:\n  provider: anthropic\n  default: claude-opus\n",
        );
        configureHermes(ctx, settings);
        // The user re-points the provider by hand but leaves our default.
        const doc = parse(read(configFile()));
        doc.model.provider = "anthropic";
        writeFileSync(configFile(), `${JSON.stringify(doc, null, 2)}\n`);

        disableHermes(ctx);
        const after = parse(read(configFile()));
        expect(after.model).toEqual({
            provider: "anthropic",
            default: "claude-opus",
        });
    });

    it("keeps a hand-installed identical skill on strip", () => {
        // The user already installed the distributed Polli skill manually.
        configureHermes(ctx, settings);
        const skillContent = read(skillFile());
        disableHermes(ctx);

        mkdirSync(join(home, ".hermes", "skills", "polli"), {
            recursive: true,
        });
        writeFileSync(skillFile(), skillContent);
        configureHermes(ctx, settings);
        // Force the strip path with an unrelated edit.
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(existsSync(skillFile())).toBe(true);
    });

    it("removes only the .env assignment that still holds our key", () => {
        configureHermes(ctx, settings);
        // The user keeps a different backup value in an earlier assignment.
        writeFileSync(
            envFile(),
            `POLLI_HERMES_API_KEY=sk_user_backup\n${read(envFile())}`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe("POLLI_HERMES_API_KEY=sk_user_backup\n");
    });

    it("normalizes a flow-style same-URL entry to block style and keeps comments", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "providers: {pollinations: {name: My Pollinations, base_url: https://gen.pollinations.ai/v1}} # why this endpoint\n",
        );
        configureHermes(ctx, settings);

        const text = read(configFile());
        expect(text).toContain("providers:\n");
        expect(text).toContain("pollinations:\n");
        expect(text).toContain("# why this endpoint");
        expect(text).not.toContain("providers: {");
        const doc = parse(text);
        expect(doc.providers.pollinations.key_env).toBe("POLLI_HERMES_API_KEY");
    });

    it("keeps a pre-existing .env key that `on` reused", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        // The user already had the same key value stored by hand.
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_test_key\n");
        writeFileSync(
            configFile(),
            "providers:\n  pollinations:\n    name: My Pollinations\n    base_url: https://gen.pollinations.ai/v1\n",
        );
        configureHermes(ctx, settings);
        // Force the strip path with unrelated edits.
        writeFileSync(envFile(), `OTHER=1\n${read(envFile())}`);
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(parseEnv(read(envFile()))).toMatchObject({
            OTHER: "1",
            POLLI_HERMES_API_KEY: "sk_test_key",
        });
    });

    it("restores a displaced pre-existing .env key on strip", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_old_manual\n");
        configureHermes(ctx, settings);
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe("POLLI_HERMES_API_KEY=sk_old_manual\n");
    });

    it("never treats lines inside a quoted multiline value as assignments", () => {
        configureHermes(ctx, settings);
        writeFileSync(
            envFile(),
            `OTHER="before\nPOLLI_HERMES_API_KEY=sk_test_key\nafter"\nPOLLI_HERMES_API_KEY=sk_test_key\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe(
            `OTHER="before\nPOLLI_HERMES_API_KEY=sk_test_key\nafter"\n`,
        );
        expect(parseEnv(read(envFile())).OTHER).toBe(
            "before\nPOLLI_HERMES_API_KEY=sk_test_key\nafter",
        );
    });

    it("restores a displaced key even when kept multiline text looks like an assignment", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_old_manual\n");
        configureHermes(ctx, settings);
        // A kept variable's multiline value contains assignment-looking text.
        writeFileSync(
            envFile(),
            `OTHER="before\nPOLLI_HERMES_API_KEY=example\nafter"\nPOLLI_HERMES_API_KEY=sk_test_key\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe(
            `OTHER="before\nPOLLI_HERMES_API_KEY=example\nafter"\nPOLLI_HERMES_API_KEY=sk_old_manual\n`,
        );
    });

    it("restores a displaced pre-existing multiline key in full", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(envFile(), `POLLI_HERMES_API_KEY="old\nmanual"\n`);
        configureHermes(ctx, settings);
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_test_key\nOTHER=1\n");
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe(
            `OTHER=1\nPOLLI_HERMES_API_KEY="old\nmanual"\n`,
        );
    });

    it("removes a current multiline assignment whose full value is ours", () => {
        configureHermes(ctx, { ...settings, apiKey: "old\nmanual" });
        writeFileSync(
            envFile(),
            `POLLI_HERMES_API_KEY="old\nmanual"\nOTHER=1\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe("OTHER=1\n");
    });

    it("keeps a changed multiline assignment that only starts like our key", () => {
        configureHermes(ctx, settings);
        writeFileSync(
            envFile(),
            `POLLI_HERMES_API_KEY="sk_test_key\nextra"\nOTHER=1\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe(
            `POLLI_HERMES_API_KEY="sk_test_key\nextra"\nOTHER=1\n`,
        );
    });

    it("never treats lines inside a backtick-quoted value as assignments", () => {
        configureHermes(ctx, settings);
        const foreign = `OTHER=\`before\nPOLLI_HERMES_API_KEY=sk_test_key\nafter\`\n`;
        writeFileSync(
            envFile(),
            `${foreign}POLLI_HERMES_API_KEY=sk_test_key\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);
        const beforeValue = parseEnv(read(envFile())).OTHER;

        disableHermes(ctx);
        expect(read(envFile())).toBe(foreign);
        expect(parseEnv(read(envFile())).OTHER).toBe(beforeValue);
    });

    it("never treats lines inside a dotted-name backtick value as assignments", () => {
        configureHermes(ctx, settings);
        const foreign = `OTHER.NAME=\`before\nPOLLI_HERMES_API_KEY=sk_test_key\nafter\`\n`;
        writeFileSync(
            envFile(),
            `${foreign}POLLI_HERMES_API_KEY=sk_test_key\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);
        const beforeValue = parseEnv(read(envFile()))["OTHER.NAME"];

        disableHermes(ctx);
        expect(read(envFile())).toBe(foreign);
        expect(parseEnv(read(envFile()))["OTHER.NAME"]).toBe(beforeValue);
    });

    it("keeps endpoint comments through on + strip round-trip", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "providers:\n  pollinations:\n    name: My Pollinations\n    base_url: https://gen.pollinations.ai/v1 # required endpoint; keep this note\n",
        );
        configureHermes(ctx, settings);
        expect(read(configFile())).toContain(
            "# required endpoint; keep this note",
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        const text = read(configFile());
        expect(text).toContain("# required endpoint; keep this note");
        expect(parse(text).providers.pollinations).toEqual({
            name: "My Pollinations",
            base_url: "https://gen.pollinations.ai/v1",
        });
    });

    it("never resurrects a key assignment the user deleted", () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(envFile(), "POLLI_HERMES_API_KEY=sk_test_key\n");
        configureHermes(ctx, settings);
        // The user deliberately removes the credential after `on`.
        writeFileSync(envFile(), "OTHER=1\n");
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe("OTHER=1\n");
    });

    it("never strips inside a multiline value of our own variable", () => {
        configureHermes(ctx, settings);
        // The user rotates the key to a multiline quoted value.
        writeFileSync(
            envFile(),
            `POLLI_HERMES_API_KEY="rotated\nPOLLI_HERMES_API_KEY=sk_test_key\ntail"\nOTHER=1\n`,
        );
        writeFileSync(configFile(), `# touched\n${read(configFile())}`);

        disableHermes(ctx);
        expect(read(envFile())).toBe(
            `POLLI_HERMES_API_KEY="rotated\nPOLLI_HERMES_API_KEY=sk_test_key\ntail"\nOTHER=1\n`,
        );
    });

    it("status reports mcp after `polli mcp install hermes`", async () => {
        configureHermes(ctx, settings);
        expect((await hermes.status(ctx)).mcp).toBe(false);
        const client = findClient("hermes");
        if (!client) throw new Error("hermes mcp client is not registered");
        await client.install({ home, env: {} }, [mcpServer], "sk_mcp_key");
        expect((await hermes.status(ctx)).mcp).toBe(true);
    });
});

describe("hermes mcp client", () => {
    const client = findClient("hermes");
    if (!client) throw new Error("hermes mcp client is not registered");

    it("installs a literal-bearer remote entry into config.yaml", async () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "# my config\nmcp_servers:\n  local:\n    command: npx\n    args: ['-y', 'mcp-server-time']\n",
        );
        const result = await client.install(
            { home, env: {} },
            [mcpServer],
            "sk_mcp_key",
        );
        expect(result.installed).toEqual(["pollinations"]);

        const text = read(configFile());
        expect(text).toContain("# my config");
        const doc = parse(text);
        expect(doc.mcp_servers.local).toEqual({
            command: "npx",
            args: ["-y", "mcp-server-time"],
        });
        expect(doc.mcp_servers.pollinations).toEqual({
            url: "https://gen.pollinations.ai/mcp/pollinations",
            headers: { Authorization: "Bearer sk_mcp_key" },
        });
        expect(client.status({ home, env: {} }).installed).toEqual([
            "pollinations",
        ]);
        expect(client.existingKey?.({ home, env: {} })).toBe("sk_mcp_key");
    });

    it("never overwrites a foreign server sharing the id", async () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "mcp_servers:\n  pollinations:\n    url: https://example.com/mcp\n",
        );
        const result = await client.install(
            { home, env: {} },
            [mcpServer],
            "sk_mcp_key",
        );
        expect(result.installed).toEqual([]);
        expect(result.notes.join("\n")).toContain("not overwritten");
        expect(parse(read(configFile())).mcp_servers.pollinations.url).toBe(
            "https://example.com/mcp",
        );
    });

    it("removes only owned entries and drops an emptied table", async () => {
        await client.install({ home, env: {} }, [mcpServer], "sk_mcp_key");
        const removed = await client.remove({ home, env: {} });
        expect(removed.removed).toEqual(["pollinations"]);
        // An emptied config is written back empty, not as a "{}" stub.
        expect(read(configFile())).toBe("");
        expect(client.status({ home, env: {} }).installed).toEqual([]);
    });

    it("remove leaves foreign servers untouched", async () => {
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(
            configFile(),
            "mcp_servers:\n  other:\n    url: https://example.com/mcp\n",
        );
        await client.install({ home, env: {} }, [mcpServer], "sk_mcp_key");
        await client.remove({ home, env: {} });
        const doc = parse(read(configFile()));
        expect(doc.mcp_servers.other).toEqual({
            url: "https://example.com/mcp",
        });
        expect(doc.mcp_servers.pollinations).toBeUndefined();
    });

    it("status and existingKey tolerate a missing or broken config", () => {
        expect(client.status({ home, env: {} }).installed).toEqual([]);
        expect(client.existingKey?.({ home, env: {} })).toBeNull();
        mkdirSync(join(home, ".hermes"), { recursive: true });
        writeFileSync(configFile(), "mcp_servers: [broken\n");
        expect(client.status({ home, env: {} }).installed).toEqual([]);
    });
});
