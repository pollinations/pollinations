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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    configureOpenclaw,
    disableOpenclaw,
    openclaw,
    openclawHome,
} from "./openclaw.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "kimi", contextWindow: 256000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 1000000, input: ["text"] },
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
const readJson = (path: string) => JSON.parse(read(path));

describe("openclaw harness", () => {
    it("writes the provider, skill, and credential from scratch", () => {
        const result = configureOpenclaw(ctx, settings);
        expect(result).toMatchObject({
            harness: "openclaw",
            configured: true,
            model: "kimi",
        });

        const doc = readJson(configFile());
        const provider = doc.models.providers.pollinations;
        expect(provider.apiKey).toBe("${POLLI_OPENCLAW_API_KEY}");
        expect(provider.baseUrl).toBe("https://gen.pollinations.ai/v1");
        expect(provider.api).toBe("openai-completions");
        expect(doc.models.mode).toBe("merge");
        expect(doc.agents.defaults.model.primary).toBe("pollinations/kimi");
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "kimi",
            "deepseek",
        ]);

        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(configFile()).mode & 0o777).toBe(0o600);
        expect(openclaw.status(ctx)).toMatchObject({
            configured: true,
            model: "kimi",
        });
    });

    it("keeps existing config entries", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        writeFileSync(
            configFile(),
            JSON.stringify(
                { ui: { theme: "dark" }, other: { setting: 42 } },
                null,
                2,
            ),
        );

        configureOpenclaw(ctx, settings);

        const doc = readJson(configFile());
        expect(doc.ui).toEqual({ theme: "dark" });
        expect(doc.other).toEqual({ setting: 42 });
        expect(doc.models.providers.pollinations.apiKey).toBe(
            "${POLLI_OPENCLAW_API_KEY}",
        );
        expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".openclaw"), { recursive: true });
        const original = `${JSON.stringify({ existing: true }, null, 2)}\n`;
        writeFileSync(configFile(), original);

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
        const edited = readJson(configFile());
        edited["agent-presets"] = { default: "mine" };
        writeFileSync(configFile(), JSON.stringify(edited, null, 2));

        const result = disableOpenclaw(ctx);

        expect(result.outcome).toBe("stripped");
        const doc = readJson(configFile());
        expect(doc["agent-presets"]).toEqual({ default: "mine" });
        expect(doc.models?.providers?.pollinations).toBeUndefined();
        expect(doc.models?.mode).toBeUndefined();
        expect(doc.agents?.defaults?.model?.primary).toBeUndefined();
        expect(doc.env?.vars?.POLLI_OPENCLAW_API_KEY).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableOpenclaw(ctx).outcome).toBe("unchanged");
    });

    it("reports unconfigured when the credential is missing", () => {
        configureOpenclaw(ctx, settings);
        unlinkSync(configFile());
        expect(openclaw.status(ctx).configured).toBe(false);
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configureOpenclaw(ctx, settings);
        configureOpenclaw(ctx, { ...settings, model: "deepseek" });
        expect(openclaw.status(ctx).model).toBe("deepseek");

        disableOpenclaw(ctx);
        expect(existsSync(configFile())).toBe(false);
    });

    it("respects OPENCLAW_HOME env var", () => {
        const customHome = mkdtempSync(join(tmpdir(), "openclaw-home-"));
        const customCtx: HarnessContext = {
            home,
            env: { OPENCLAW_HOME: customHome },
        };
        try {
            expect(openclawHome(customCtx)).toBe(customHome);
            configureOpenclaw(customCtx, settings);
            const doc = readJson(join(customHome, "openclaw.json"));
            expect(doc.env.vars.POLLI_OPENCLAW_API_KEY).toBe("sk_test_key");
            expect(doc.agents.defaults.model.primary).toBe("pollinations/kimi");
        } finally {
            rmSync(customHome, { recursive: true, force: true });
        }
    });
});
