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
import { configurePrime, disablePrime, prime } from "./prime.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "deepseek", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-prime-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const agentDir = () => join(home, ".prime", "agent");
const modelsFile = () => join(agentDir(), "models.json");
const settingsFile = () => join(agentDir(), "settings.json");
const skillFile = () => join(agentDir(), "skills", "polli", "SKILL.md");
const snapshots = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("prime."))
        : [];
};
const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

describe("prime harness", () => {
    it("writes provider, settings default, and skill from scratch", () => {
        const result = configurePrime(ctx, settings);
        expect(result).toMatchObject({
            harness: "prime",
            configured: true,
            model: "deepseek",
        });

        const provider = readJson(modelsFile()).providers?.pollinations as
            | Record<string, unknown>
            | undefined;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKey: "sk_test_key",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect(
            (provider?.models as Array<{ id: string }>).map((m) => m.id),
        ).toEqual(["deepseek", "kimi"]);

        expect(readJson(settingsFile())).toEqual({
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
        expect(readFileSync(skillFile(), "utf-8")).toContain("name: polli");
        expect(statSync(modelsFile()).mode & 0o777).toBe(0o600);
        expect(prime.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("preserves existing provider config, memories, and settings", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: {
                    anthropic: { baseUrl: "https://api.anthropic.com" },
                },
            }),
        );
        // Prime keeps agent state (sessions, memories) alongside config.
        writeFileSync(
            join(agentDir(), "sessions.json"),
            JSON.stringify({ active: ["session-1"] }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({ theme: "dark", defaultProvider: "anthropic" }),
        );

        configurePrime(ctx, settings);

        expect(readJson(modelsFile()).providers?.anthropic).toBeDefined();
        expect(readJson(settingsFile())).toEqual({
            theme: "dark",
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
        expect(readJson(join(agentDir(), "sessions.json"))).toEqual({
            active: ["session-1"],
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(agentDir(), { recursive: true });
        const originalModels = JSON.stringify({
            providers: { anthropic: { baseUrl: "https://api.anthropic.com" } },
        });
        const originalSettings = JSON.stringify({ theme: "dark" });
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(settingsFile(), originalSettings);

        configurePrime(ctx, settings);
        const result = disablePrime(ctx);

        expect(result.outcome).toBe("restored");
        expect(readFileSync(modelsFile(), "utf-8")).toBe(originalModels);
        expect(readFileSync(settingsFile(), "utf-8")).toBe(originalSettings);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when config changed since on", () => {
        configurePrime(ctx, settings);
        const edited = readJson(modelsFile());
        (edited.providers as Record<string, unknown>).anthropic = {
            baseUrl: "https://api.anthropic.com",
        };
        writeFileSync(modelsFile(), JSON.stringify(edited, null, 2));

        const result = disablePrime(ctx);

        expect(result.outcome).toBe("stripped");
        expect(readJson(modelsFile()).providers?.pollinations).toBeUndefined();
        expect(readJson(modelsFile()).providers?.anthropic).toBeDefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disablePrime(ctx).outcome).toBe("unchanged");
    });

    it("reports unconfigured when the skill is missing", () => {
        configurePrime(ctx, settings);
        unlinkSync(skillFile());
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("survives a re-run with a different default model", () => {
        configurePrime(ctx, settings);
        configurePrime(ctx, { ...settings, model: "kimi" });
        expect(prime.status(ctx).model).toBe("kimi");

        disablePrime(ctx);
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configurePrime(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshots()[0],
        );
        writeFileSync(snapshot, "{");

        expect(() => disablePrime(ctx)).toThrow();
        expect(snapshots()).toHaveLength(1);
        expect(prime.status(ctx).configured).toBe(true);
    });
});
