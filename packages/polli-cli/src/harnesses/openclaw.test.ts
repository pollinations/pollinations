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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSON5 from "json5";
import { configureOpenclaw, disableOpenclaw, openclaw } from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: "kimi", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const configFile = () => join(home, ".openclaw", "openclaw.json");
const skillFile = () => join(home, ".openclaw", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("openclaw."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

describe("openclaw harness", () => {
    it("writes the provider, live models, dedicated key, and skill from scratch", () => {
        const result = configureOpenclaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const doc = JSON5.parse(read(configFile()));
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
        expect(doc.models.mode).toBe("merge");
        const provider = doc.models.providers.pollinations;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKey: "${POLLI_OPENCLAW_API_KEY}",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "kimi",
            "deepseek",
        ]);
        expect(doc.agents.defaults.model.primary).toBe("pollinations/kimi");
        expect(doc.agents.defaults.models["pollinations/*"]).toEqual({});
        expect(doc.skills.load.extraDirs).toContain(
            join(home, ".openclaw", "skills"),
        );

        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(statSync(join(home, ".openclaw")).mode & 0o777).toBe(0o700);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("preserves existing config and env vars", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify(
                {
                    env: { vars: { MY_TOKEN: "abc" } },
                    agents: {
                        defaults: {
                            model: { primary: "anthropic/claude-opus-5" },
                            workspace: "~/.openclaw/workspace",
                        },
                    },
                    models: {
                        providers: {
                            anthropic: { baseUrl: "https://api.anthropic.com" },
                        },
                    },
                },
                null,
                2,
            ),
            { mode: 0o644 },
        );

        configureOpenclaw(ctx, settings);

        const doc = JSON5.parse(read(configFile()));
        expect(doc.env.vars.MY_TOKEN).toBe("abc");
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
        expect(doc.agents.defaults.workspace).toBe("~/.openclaw/workspace");
        expect(
            doc.models.providers.pollinations.baseUrl,
        ).toBeDefined();
        expect(doc.models.providers.anthropic.baseUrl).toBe(
            "https://api.anthropic.com",
        );
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const original = JSON.stringify(
            { agents: { defaults: { model: { primary: "anthropic/claude" } } } },
            null,
            2,
        );
        writeFileSync(configFile(), original, { mode: 0o600 });

        configureOpenclaw(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureOpenclaw(ctx, settings);
        const doc = JSON5.parse(read(configFile()));
        doc.agents.defaults.workspace = "~/.openclaw/workspace";
        writeFileSync(configFile(), JSON.stringify(doc, null, 2) + "\n");

        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("stripped");
        const stripped = JSON5.parse(read(configFile()));
        expect(stripped.agents.defaults.workspace).toBe(
            "~/.openclaw/workspace",
        );
        expect(stripped.env).toBeUndefined();
        expect(stripped.models).toBeUndefined();
        expect(stripped.skills).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenclaw(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenclaw(ctx, settings);
        configureOpenclaw(ctx, { ...settings, model: "deepseek" });
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenclaw(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("preserves an unrelated skill dir already in extraDirs", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify({
                skills: { load: { extraDirs: ["~/other-skills"] } },
            }),
            { mode: 0o600 },
        );

        configureOpenclaw(ctx, settings);
        const doc = JSON5.parse(read(configFile()));
        expect(doc.skills.load.extraDirs).toContain("~/other-skills");

        disableOpenclaw(ctx);
        const stripped = JSON5.parse(read(configFile()));
        expect(stripped.skills.load.extraDirs).toEqual(["~/other-skills"]);
        expect(stripped.env).toBeUndefined();
    });
});
