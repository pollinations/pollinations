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
import { parse, stringify } from "yaml";
import { dsh } from "./dsh.js";
import { disableHarness, enableHarness, harnessStatus } from "./engine.js";
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
const credsFile = () => join(home, ".dsh", ".credentials.yaml");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.startsWith("dsh."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

describe("dsh harness", () => {
    it("writes the provider, default model, and credentials from scratch", () => {
        const result = enableHarness(dsh, ctx, settings);
        expect(result).toMatchObject({
            harness: "dsh",
            configured: true,
            model: "deepseek",
        });

        const doc = parse(read(settingsFile()));
        expect(doc["agent-default-model"]).toEqual({
            provider: "pollinations",
            model: "deepseek",
        });
        const provider = doc["llm-pi-ai"].providers.pollinations;
        expect(provider).toMatchObject({
            api: "openai-completions",
            apiKeyEnv: "POLLINATIONS_API_KEY",
            baseURL: "https://gen.pollinations.ai/v1",
        });
        expect(provider.models.map((m: { id: string }) => m.id)).toEqual([
            "deepseek",
            "kimi",
        ]);

        expect(parse(read(credsFile()))).toEqual({
            version: 1,
            refs: { POLLINATIONS_API_KEY: "sk_test_key" },
        });
        expect(statSync(credsFile()).mode & 0o777).toBe(0o600);
        expect(dsh.readKey(ctx)).toBe("sk_test_key");
        expect(harnessStatus(dsh, ctx)).toMatchObject({
            configured: true,
            model: "deepseek",
        });
    });

    it("keeps existing settings, comments, and other credentials", () => {
        mkdirSync(join(home, ".dsh"), { recursive: true });
        writeFileSync(
            settingsFile(),
            "# my notes\nui-onboarding:\n  welcomeNoticeVersion: 1\nagent-default-model:\n  provider: deepseek\n  model: deepseek-chat\n",
        );
        writeFileSync(
            credsFile(),
            "version: 1\nrefs:\n  DEEPSEEK_API_KEY: ds-secret\n",
            { mode: 0o600 },
        );

        enableHarness(dsh, ctx, settings);

        const text = read(settingsFile());
        expect(text).toContain("# my notes");
        expect(parse(text)["ui-onboarding"]).toEqual({
            welcomeNoticeVersion: 1,
        });
        expect(parse(read(credsFile())).refs).toEqual({
            DEEPSEEK_API_KEY: "ds-secret",
            POLLINATIONS_API_KEY: "sk_test_key",
        });
    });

    it("restores the original files byte-for-byte on off", () => {
        mkdirSync(join(home, ".dsh"), { recursive: true });
        const original =
            "agent-default-model: {provider: deepseek, model: deepseek-chat}\n";
        writeFileSync(settingsFile(), original);

        enableHarness(dsh, ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        const result = disableHarness(dsh, ctx);

        expect(result.outcome).toBe("restored");
        expect(read(settingsFile())).toBe(original);
        expect(existsSync(credsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(harnessStatus(dsh, ctx).configured).toBe(false);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        enableHarness(dsh, ctx, settings);
        const edited = parse(read(settingsFile()));
        edited["agent-presets"] = { default: "mine" };
        writeFileSync(settingsFile(), stringify(edited));

        const result = disableHarness(dsh, ctx);

        expect(result.outcome).toBe("stripped");
        const doc = parse(read(settingsFile()));
        expect(doc["agent-presets"]).toEqual({ default: "mine" });
        expect(doc["agent-default-model"]).toBeUndefined();
        expect(doc["llm-pi-ai"].providers.pollinations).toBeUndefined();
        expect(parse(read(credsFile())).refs).toEqual({});
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        expect(disableHarness(dsh, ctx).outcome).toBe("unchanged");
    });

    it("keeps one backup per harness home", () => {
        enableHarness(dsh, ctx, settings);
        const moved = { home, env: { DSH_HOME: join(home, "moved") } };
        enableHarness(dsh, moved, settings);
        expect(snapshotFiles()).toHaveLength(2);

        expect(disableHarness(dsh, moved).outcome).toBe("restored");
        expect(existsSync(join(home, "moved", "settings.yaml"))).toBe(false);
        // The original location is untouched and still has its own backup.
        expect(harnessStatus(dsh, ctx).configured).toBe(true);
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("re-running on switches the model and keeps the pre-on backup", () => {
        enableHarness(dsh, ctx, settings);
        enableHarness(dsh, ctx, { ...settings, model: "kimi" });
        expect(harnessStatus(dsh, ctx).model).toBe("kimi");

        disableHarness(dsh, ctx);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("honors DSH_HOME", () => {
        const custom = join(home, "custom-dsh");
        enableHarness(dsh, { home, env: { DSH_HOME: custom } }, settings);
        expect(existsSync(join(custom, "settings.yaml"))).toBe(true);
        expect(existsSync(settingsFile())).toBe(false);
    });
});
