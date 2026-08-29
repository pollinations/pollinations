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
import { parse, stringify } from "yaml";
import { configureDsh, disableDsh, dsh } from "./dsh.js";
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

const settingsFile = () => join(home, ".dsh", "settings.yaml");
const envFile = () => join(home, ".dsh", ".env");
const patchFile = () => join(home, ".dsh", "cordis.patch.yml");
const skillFile = () => join(home, ".dsh", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("dsh."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

describe("dsh harness", () => {
    it("writes the provider, MCP, skill, and credential from scratch", () => {
        const result = configureDsh(ctx, settings);
        expect(result).toMatchObject({
            harness: "dsh",
            configured: true,
            model: "deepseek",
            mcp: true,
        });

        const doc = parse(read(settingsFile()));
        expect(doc["agent-default-model"]).toEqual({
            provider: "pollinations",
            model: "deepseek",
        });
        const provider = doc["llm-pi-ai"].providers.pollinations;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKeyEnv: "POLLI_DSH_API_KEY",
            baseURL: "https://gen.pollinations.ai/v1",
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "deepseek",
            "kimi",
        ]);

        expect(parseEnv(read(envFile())).POLLI_DSH_API_KEY).toBe("sk_test_key");
        const patch = read(patchFile());
        expect(patch).toContain("id: mcp-pollinations");
        expect(patch).toContain("name: \"@deepseek-ai/dsh-mcp-client\"");
        expect(patch).toContain("serverName: pollinations");
        expect(patch).toContain("transport: streamable-http");
        expect(patch).toContain(
            "url: https://gen.pollinations.ai/mcp/pollinations",
        );
        expect(patch).toContain(
            "!!js '`Bearer ${process.env.POLLI_DSH_API_KEY}`'",
        );
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
        expect(statSync(patchFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(statSync(join(home, ".dsh")).mode & 0o777).toBe(0o700);
        expect(dsh.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing settings, comments, environment, and MCP entries", () => {
        mkdirSync(join(home, ".dsh"), { recursive: true });
        writeFileSync(
            settingsFile(),
            "# my notes\nui-onboarding:\n  welcomeNoticeVersion: 1\nagent-default-model:\n  provider: deepseek\n  model: deepseek-chat\n",
        );
        writeFileSync(
            envFile(),
            "# local env\nDEEPSEEK_API_KEY=ds-secret\n",
            { mode: 0o644 },
        );
        writeFileSync(
            patchFile(),
            "# my plugins\n- insert:\n    - id: mcp-local\n      name: local-mcp\n",
        );

        configureDsh(ctx, settings);

        const text = read(settingsFile());
        expect(text).toContain("# my notes");
        expect(parse(text)["ui-onboarding"]).toEqual({
            welcomeNoticeVersion: 1,
        });
        expect(read(envFile())).toContain("# local env");
        expect(parseEnv(read(envFile()))).toMatchObject({
            DEEPSEEK_API_KEY: "ds-secret",
            POLLI_DSH_API_KEY: "sk_test_key",
        });
        expect(read(patchFile())).toContain("# my plugins");
        expect(read(patchFile())).toContain("id: mcp-local");
        expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".dsh"), { recursive: true });
        const original =
            "agent-default-model: {provider: deepseek, model: deepseek-chat}\n";
        writeFileSync(settingsFile(), original);

        configureDsh(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableDsh(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(settingsFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(existsSync(patchFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(dsh.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureDsh(ctx, settings);
        const edited = parse(read(settingsFile()));
        edited["agent-presets"] = { default: "mine" };
        writeFileSync(settingsFile(), stringify(edited));

        const result = disableDsh(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = parse(read(settingsFile()));
        expect(doc["agent-presets"]).toEqual({ default: "mine" });
        expect(doc["agent-default-model"]).toBeUndefined();
        expect(doc["llm-pi-ai"].providers.pollinations).toBeUndefined();
        expect(parseEnv(read(envFile())).POLLI_DSH_API_KEY).toBeUndefined();
        expect(read(patchFile())).not.toContain("mcp-pollinations");
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableDsh(ctx).outcome).toBe("unchanged");
    });

    it("can skip MCP configuration", () => {
        const result = configureDsh(ctx, { ...settings, mcp: false });

        expect(result).toMatchObject({ configured: true, mcp: false });
        expect(existsSync(patchFile())).toBe(false);
        expect(existsSync(skillFile())).toBe(true);
    });

    it("keeps one backup per harness home", () => {
        configureDsh(ctx, settings);
        const moved = { home, env: { DSH_HOME: join(home, "moved") } };
        configureDsh(moved, settings);
        expect(snapshotFiles()).toHaveLength(2);

        expect(disableDsh(moved).outcome).toBe("restored");
        expect(existsSync(join(home, "moved", "settings.yaml"))).toBe(false);
        // The original location is untouched and still has its own backup.
        expect(dsh.status(ctx).configured).toBe(true);
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureDsh(ctx, settings);
        configureDsh(ctx, { ...settings, model: "kimi" });
        expect(dsh.status(ctx).model).toBe("kimi");

        disableDsh(ctx);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("honors DSH_HOME", () => {
        const custom = join(home, "custom-dsh");
        configureDsh({ home, env: { DSH_HOME: custom } }, settings);
        expect(existsSync(join(custom, "settings.yaml"))).toBe(true);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("treats an empty DSH_HOME as unset", () => {
        configureDsh({ home, env: { DSH_HOME: "  " } }, settings);
        expect(existsSync(settingsFile())).toBe(true);
    });

    it("expands a tilde in DSH_HOME", () => {
        configureDsh({ home, env: { DSH_HOME: "~/custom-dsh" } }, settings);
        expect(existsSync(join(home, "custom-dsh", "settings.yaml"))).toBe(
            true,
        );
    });

    it("reports unconfigured when the credential is missing", () => {
        configureDsh(ctx, settings);
        unlinkSync(envFile());
        expect(dsh.status(ctx).configured).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configureDsh(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        writeFileSync(snapshot, "{");

        expect(() => disableDsh(ctx)).toThrow();
        expect(snapshotFiles()).toHaveLength(1);
        expect(dsh.status(ctx).configured).toBe(true);
    });

    it("rolls back earlier files when the MCP config is invalid", () => {
        mkdirSync(join(home, ".dsh"), { recursive: true });
        const original =
            "agent-default-model: {provider: deepseek, model: deepseek-chat}\n";
        writeFileSync(settingsFile(), original);
        const invalidPatch = "{}\n";
        writeFileSync(patchFile(), invalidPatch, { mode: 0o600 });

        expect(() => configureDsh(ctx, settings)).toThrow();

        expect(read(settingsFile())).toBe(original);
        expect(existsSync(envFile())).toBe(false);
        expect(read(patchFile())).toBe(invalidPatch);
        expect(snapshotFiles()).toHaveLength(0);
    });
});
