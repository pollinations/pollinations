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
import { configurePi, disablePi, pi, piAgentDir } from "./pi.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "deepseek", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-pi-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const agentDir = (c: HarnessContext = ctx) => piAgentDir(c);
const modelsFile = (c: HarnessContext = ctx) =>
    join(agentDir(c), "models.json");
const settingsFile = (c: HarnessContext = ctx) =>
    join(agentDir(c), "settings.json");
const skillFile = (c: HarnessContext = ctx) =>
    join(agentDir(c), "skills", "polli", "SKILL.md");
const snapshots = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("pi."))
        : [];
};
const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

describe("pi harness", () => {
    it("writes provider, settings default, and skill from scratch", () => {
        const result = configurePi(ctx, settings);
        expect(result).toMatchObject({
            harness: "pi",
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
        expect(statSync(settingsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(pi.status(ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("preserves existing providers and settings", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: { ollama: { baseUrl: "http://localhost:1/v1" } },
            }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({ theme: "dark", defaultProvider: "ollama" }),
        );

        configurePi(ctx, settings);

        const modelsData = readJson(modelsFile());
        expect(modelsData.providers?.ollama).toBeDefined();
        expect(modelsData.providers?.pollinations).toBeDefined();
        expect(readJson(settingsFile())).toEqual({
            theme: "dark",
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(agentDir(), { recursive: true });
        const originalModels = JSON.stringify({
            providers: { ollama: { baseUrl: "http://localhost:1/v1" } },
        });
        const originalSettings = JSON.stringify({ theme: "dark" });
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(settingsFile(), originalSettings);

        configurePi(ctx, settings);
        expect(snapshots()).toHaveLength(1);
        const result = disablePi(ctx);

        expect(result.outcome).toBe("restored");
        expect(readFileSync(modelsFile(), "utf-8")).toBe(originalModels);
        expect(readFileSync(settingsFile(), "utf-8")).toBe(originalSettings);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when config changed since on", () => {
        configurePi(ctx, settings);
        const edited = readJson(modelsFile());
        edited.providers = {
            ollama: { baseUrl: "http://localhost:1/v1" },
            ...(edited.providers as Record<string, unknown>),
        };
        writeFileSync(modelsFile(), JSON.stringify(edited, null, 2));

        const result = disablePi(ctx);

        expect(result.outcome).toBe("stripped");
        expect(readJson(modelsFile()).providers?.pollinations).toBeUndefined();
        expect(readJson(modelsFile()).providers?.ollama).toBeDefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshots()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disablePi(ctx).outcome).toBe("unchanged");
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        configurePi(ctx, settings);
        configurePi(ctx, { ...settings, model: "kimi" });
        expect(pi.status(ctx).model).toBe("kimi");

        disablePi(ctx);
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("honors PI_CODING_AGENT_DIR with tilde expansion", () => {
        const custom = join(home, "custom-pi");
        const c: HarnessContext = {
            home,
            env: { PI_CODING_AGENT_DIR: `~/${custom.slice(home.length + 1)}` },
        };
        configurePi(c, settings);
        expect(piAgentDir(c)).toBe(custom);
        expect(existsSync(join(custom, "models.json"))).toBe(true);
        expect(existsSync(join(home, ".pi", "agent"))).toBe(false);

        const disabled = disablePi(c);
        expect(disabled.outcome).toBe("restored");
        expect(existsSync(join(custom, "models.json"))).toBe(false);
    });

    it("reports unconfigured when the key or skill is missing", () => {
        configurePi(ctx, settings);
        unlinkSync(skillFile());
        expect(pi.status(ctx).configured).toBe(false);

        configurePi(ctx, settings);
        const modelsData = readJson(modelsFile());
        (modelsData.providers as Record<string, unknown>).pollinations = {
            ...(modelsData.providers as Record<string, unknown>).pollinations,
            apiKey: "",
        };
        writeFileSync(modelsFile(), JSON.stringify(modelsData, null, 2));
        expect(pi.status(ctx).configured).toBe(false);
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configurePi(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshots()[0],
        );
        writeFileSync(snapshot, "{");

        expect(() => disablePi(ctx)).toThrow();
        expect(snapshots()).toHaveLength(1);
        expect(pi.status(ctx).configured).toBe(true);
    });
});
