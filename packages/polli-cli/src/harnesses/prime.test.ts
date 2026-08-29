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
    { id: "openai", contextWindow: 128000, input: ["text", "image"] },
    { id: "deepseek", contextWindow: 65536, input: ["text"] },
];
const settings = { apiKey: "sk_test_key", model: "openai", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-prime-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const modelsFile = () => join(home, ".prime", "agent", "models.json");
const skillFile = () =>
    join(home, ".prime", "agent", "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("prime."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

describe("prime harness", () => {
    it("writes the provider and skill from scratch", () => {
        const result = configurePrime(ctx, settings);
        expect(result).toMatchObject({
            harness: "prime",
            configured: true,
            model: "openai",
        });

        const doc = JSON.parse(read(modelsFile()));
        const provider = doc.providers.pollinations;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKey: "sk_test_key",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect(provider.compat).toMatchObject({
            supportsDeveloperRole: false,
            supportsReasoningEffort: true,
            supportsUsageInStreaming: true,
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "openai",
            "deepseek",
        ]);
        expect(read(skillFile())).toContain("name: polli");
        expect(statSync(modelsFile()).mode & 0o777).toBe(0o600);
        expect(statSync(skillFile()).mode & 0o777).toBe(0o600);
        expect(prime.status(ctx)).toMatchObject({
            configured: true,
            model: "openai",
        });
    });

    it("sorts the chosen model first in the models list", () => {
        configurePrime(ctx, { ...settings, model: "deepseek" });
        const doc = JSON.parse(read(modelsFile()));
        const ids = doc.providers.pollinations.models.map(
            (m: { id: string }) => m.id,
        );
        expect(ids[0]).toBe("deepseek");
        expect(ids).toContain("openai");
        expect(prime.status(ctx).model).toBe("deepseek");
    });

    it("preserves existing models.json entries and other providers", () => {
        mkdirSync(join(home, ".prime", "agent"), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: {
                    anthropic: { baseUrl: "https://api.anthropic.com" },
                },
            }),
        );

        configurePrime(ctx, settings);

        const doc = JSON.parse(read(modelsFile()));
        expect(doc.providers.anthropic).toEqual({
            baseUrl: "https://api.anthropic.com",
        });
        expect(doc.providers.pollinations).toBeDefined();
    });

    it("restores original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".prime", "agent"), { recursive: true });
        const original = JSON.stringify({ providers: { anthropic: {} } });
        writeFileSync(modelsFile(), original);

        configurePrime(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disablePrime(ctx);

        expect(result.outcome).toBe("restored");
        expect(read(modelsFile())).toBe(original);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("strips only Pollinations entries when config changed since on", () => {
        configurePrime(ctx, settings);

        const doc = JSON.parse(read(modelsFile()));
        doc.providers.local = { baseUrl: "http://localhost:11434/v1" };
        writeFileSync(modelsFile(), JSON.stringify(doc, null, 2));

        const result = disablePrime(ctx);

        expect(result.outcome).toBe("stripped");
        const updated = JSON.parse(read(modelsFile()));
        expect(updated.providers.local).toBeDefined();
        expect(updated.providers.pollinations).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disablePrime(ctx).outcome).toBe("unchanged");
    });

    it("re-running on updates the model list and keeps the pre-on backup", () => {
        configurePrime(ctx, settings);
        const newModels = [
            { id: "openai", contextWindow: 200000, input: ["text", "image"] },
        ];
        configurePrime(ctx, {
            apiKey: "sk_test_key",
            model: "openai",
            models: newModels,
        });

        const doc = JSON.parse(read(modelsFile()));
        expect(doc.providers.pollinations.models).toHaveLength(1);
        expect(doc.providers.pollinations.models[0].contextWindow).toBe(200000);

        disablePrime(ctx);
        expect(existsSync(modelsFile())).toBe(false);
    });

    it("reports unconfigured when models.json is missing", () => {
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("reports unconfigured when the skill file is missing", () => {
        configurePrime(ctx, settings);
        unlinkSync(skillFile());
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("reports unconfigured when models.json is corrupt JSON", () => {
        mkdirSync(join(home, ".prime", "agent"), { recursive: true });
        writeFileSync(modelsFile(), "{bad json");
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("reports unconfigured when the api key is empty", () => {
        configurePrime(ctx, settings);
        const doc = JSON.parse(read(modelsFile()));
        doc.providers.pollinations.apiKey = "";
        writeFileSync(modelsFile(), JSON.stringify(doc, null, 2));
        expect(prime.status(ctx).configured).toBe(false);
    });

    it("throws on corrupt models.json during on", () => {
        mkdirSync(join(home, ".prime", "agent"), { recursive: true });
        writeFileSync(modelsFile(), "{bad");
        expect(() => configurePrime(ctx, settings)).toThrow();
    });

    it("preserves a corrupt snapshot and refuses to disable", () => {
        configurePrime(ctx, settings);
        const snapshot = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        writeFileSync(snapshot, "{");
        expect(() => disablePrime(ctx)).toThrow();
        expect(snapshotFiles()).toHaveLength(1);
        expect(prime.status(ctx).configured).toBe(true);
    });

    it("keeps one backup per home location", () => {
        configurePrime(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        expect(disablePrime(ctx).outcome).toBe("restored");
        expect(snapshotFiles()).toHaveLength(0);
    });
});
