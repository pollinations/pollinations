import { execFileSync } from "node:child_process";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurePi, disablePi, pi, piAgentDir } from "./pi.js";
import type { HarnessContext } from "./types.js";

vi.mock("node:child_process", () => ({
    execFileSync: vi.fn(() => Buffer.from("pi 1.0.0")),
}));

const models = [
    { id: "deepseek", contextWindow: 1048576, input: ["text"] },
    { id: "kimi", contextWindow: 262000, input: ["text", "image"] },
];
const settings = { apiKey: "sk_test_key", model: "deepseek", models };

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-pi-harness-"));
    ctx = { home, env: {} };
    vi.mocked(execFileSync).mockImplementation(() => Buffer.from("pi 1.0.0"));
});

afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
});

const agentDir = () => join(home, ".pi", "agent");
const modelsFile = () => join(agentDir(), "models.json");
const authFile = () => join(agentDir(), "auth.json");
const settingsFile = () => join(agentDir(), "settings.json");
const skillFile = () => join(agentDir(), "skills", "polli", "SKILL.md");
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((file) => file.startsWith("pi."))
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) =>
    JSON.parse(read(path)) as Record<string, unknown>;

const apiResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    json: async () => body,
    text: async () => JSON.stringify(body),
});

interface CatalogModelFixture {
    id: string;
    tools?: boolean;
    output_modalities?: string[];
    supported_endpoints?: string[];
    context_length?: number;
    input_modalities?: string[];
}

const liveFetch = (
    liveModels: CatalogModelFixture[] = models.map((model) => ({
        id: model.id,
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: model.contextWindow,
        input_modalities: model.input,
    })),
    valid = true,
) =>
    vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/account/key")) {
            return apiResponse({ valid });
        }
        if (url.endsWith("/v1/models")) {
            return apiResponse({ data: liveModels });
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    });

describe("pi harness", () => {
    it("uses the official default directory and supports the documented override", () => {
        expect(piAgentDir(ctx)).toBe(join(home, ".pi", "agent"));
        expect(
            piAgentDir({ home, env: { PI_CODING_AGENT_DIR: "~/custom-pi" } }),
        ).toBe(join(home, "custom-pi"));
        expect(piAgentDir({ home, env: { PI_CODING_AGENT_DIR: "  " } })).toBe(
            join(home, ".pi", "agent"),
        );
    });

    it("writes the official provider, auth, defaults, and skill while preserving peers", () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: { ollama: { api: "openai-completions" } },
            }),
        );
        writeFileSync(
            authFile(),
            JSON.stringify({ openai: { type: "api_key", key: "other" } }),
        );
        writeFileSync(settingsFile(), JSON.stringify({ theme: "dark" }));

        const result = configurePi(ctx, settings);

        expect(result).toMatchObject({
            harness: "pi",
            configured: true,
            model: "deepseek",
        });
        const provider = (
            readJson(modelsFile()).providers as Record<string, unknown>
        ).pollinations as Record<string, unknown>;
        expect(provider).toMatchObject({
            api: "openai-completions",
            baseUrl: "https://gen.pollinations.ai/v1",
        });
        expect(provider).not.toHaveProperty("apiKey");
        expect(
            (provider.models as { id: string }[]).map(({ id }) => id),
        ).toEqual(["deepseek", "kimi"]);
        expect(readJson(modelsFile()).providers).toHaveProperty("ollama");
        expect(readJson(authFile())).toMatchObject({
            openai: { type: "api_key", key: "other" },
            pollinations: { type: "api_key", key: "sk_test_key" },
        });
        expect(readJson(settingsFile())).toMatchObject({
            theme: "dark",
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
        expect(read(skillFile())).toContain("name: polli");
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("rejects malformed existing JSON before creating snapshots or writing any target", () => {
        for (const file of [modelsFile(), authFile(), settingsFile()]) {
            mkdirSync(agentDir(), { recursive: true });
            writeFileSync(file, "{not-json");
            const before = read(file);

            expect(() => configurePi(ctx, settings)).toThrow(/Invalid JSON/);
            expect(read(file)).toBe(before);
            expect(snapshotFiles()).toHaveLength(0);
            rmSync(agentDir(), { recursive: true, force: true });
        }
    });

    it("rolls back config when the final structural result is not configured", () => {
        mkdirSync(agentDir(), { recursive: true });
        const originalModels =
            '{"providers":{"ollama":{"api":"openai-completions"}}}\n';
        const originalAuth = '{"openai":{"type":"api_key","key":"other"}}\n';
        const originalSettings = '{"theme":"dark"}\n';
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(authFile(), originalAuth);
        writeFileSync(settingsFile(), originalSettings);

        const invalidModels = [{ id: "deepseek", contextWindow: 0, input: [] }];
        expect(() =>
            configurePi(ctx, {
                apiKey: "sk_test_key",
                model: "deepseek",
                models: invalidModels,
            }),
        ).toThrow(/did not produce a configured harness/);
        expect(read(modelsFile())).toBe(originalModels);
        expect(read(authFile())).toBe(originalAuth);
        expect(read(settingsFile())).toBe(originalSettings);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("rejects a conflicting skill before writing config", () => {
        mkdirSync(join(agentDir(), "skills", "polli"), { recursive: true });
        writeFileSync(skillFile(), "user-owned skill");

        expect(() => configurePi(ctx, settings)).toThrow(/already owned/);
        expect(read(skillFile())).toBe("user-owned skill");
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(authFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
    });

    it("restores every untouched file byte-for-byte and makes off idempotent", () => {
        mkdirSync(agentDir(), { recursive: true });
        const originalModels =
            '{"providers":{"ollama":{"api":"openai-completions"}}}\n';
        const originalAuth = '{"openai":{"type":"api_key","key":"other"}}\n';
        const originalSettings = '{"theme":"dark"}\n';
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(authFile(), originalAuth);
        writeFileSync(settingsFile(), originalSettings);

        configurePi(ctx, settings);
        expect(disablePi(ctx)).toMatchObject({
            outcome: "restored",
            configured: false,
        });
        expect(read(modelsFile())).toBe(originalModels);
        expect(read(authFile())).toBe(originalAuth);
        expect(read(settingsFile())).toBe(originalSettings);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(disablePi(ctx).outcome).toBe("unchanged");
    });

    it("strips only Pollinations-owned entries after an unrelated user edit", () => {
        configurePi(ctx, settings);
        const edited = readJson(settingsFile());
        edited.theme = "light";
        writeFileSync(settingsFile(), `${JSON.stringify(edited, null, 2)}\n`);

        expect(disablePi(ctx)).toMatchObject({
            outcome: "stripped",
            configured: false,
        });
        expect(readJson(modelsFile()).providers).toEqual({});
        expect(readJson(authFile())).toEqual({});
        expect(readJson(settingsFile())).toEqual({ theme: "light" });
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("preserves user-changed provider and model defaults during surgical off", () => {
        configurePi(ctx, settings);

        const modelsData = readJson(modelsFile());
        const providers = modelsData.providers as Record<string, unknown>;
        providers.pollinations = {
            ...(providers.pollinations as Record<string, unknown>),
            models: [
                ...(providers.pollinations as { models: unknown[] }).models,
                { id: "user-model" },
            ],
        };
        writeFileSync(modelsFile(), `${JSON.stringify(modelsData, null, 2)}\n`);

        const settingsData = readJson(settingsFile());
        settingsData.defaultProvider = "user-provider";
        settingsData.defaultModel = "kimi";
        settingsData.theme = "light";
        writeFileSync(
            settingsFile(),
            `${JSON.stringify(settingsData, null, 2)}\n`,
        );

        expect(disablePi(ctx).outcome).toBe("stripped");
        expect(
            (readJson(modelsFile()).providers as Record<string, unknown>)
                .pollinations,
        ).toHaveProperty("models");
        expect(readJson(settingsFile())).toMatchObject({
            defaultProvider: "user-provider",
            defaultModel: "kimi",
            theme: "light",
        });
    });

    it("preserves a user-changed Pollinations credential during surgical off", () => {
        configurePi(ctx, settings);

        const authData = readJson(authFile());
        (authData.pollinations as Record<string, unknown>).key = "sk_user_key";
        writeFileSync(authFile(), `${JSON.stringify(authData, null, 2)}\n`);

        expect(disablePi(ctx).outcome).toBe("stripped");
        expect(readJson(authFile())).toEqual({
            pollinations: { type: "api_key", key: "sk_user_key" },
        });
    });

    it("rejects a pre-existing Pollinations slot with a user-owned skill", () => {
        mkdirSync(join(agentDir(), "skills", "polli"), { recursive: true });
        const originalProvider = {
            api: "openai-completions",
            baseUrl: "http://local/v1",
        };
        const originalSkill = "user-owned skill";
        writeFileSync(
            modelsFile(),
            JSON.stringify({ providers: { pollinations: originalProvider } }),
        );
        writeFileSync(
            authFile(),
            JSON.stringify({ pollinations: { type: "api_key", key: "old" } }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                defaultProvider: "pollinations",
                defaultModel: "old",
            }),
        );
        writeFileSync(skillFile(), originalSkill);

        expect(() => configurePi(ctx, settings)).toThrow(/already owned/);
        expect(
            (readJson(modelsFile()).providers as Record<string, unknown>)
                .pollinations,
        ).toEqual(originalProvider);
        expect(readJson(authFile()).pollinations).toEqual({
            type: "api_key",
            key: "old",
        });
        expect(readJson(settingsFile())).toMatchObject({
            defaultProvider: "pollinations",
            defaultModel: "old",
        });
        expect(read(skillFile())).toBe(originalSkill);
    });

    it("selects deepseek when available and otherwise uses a deterministic compatible model", async () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            authFile(),
            JSON.stringify({
                pollinations: { type: "api_key", key: "sk_test_key" },
            }),
        );
        vi.stubGlobal(
            "fetch",
            liveFetch([
                {
                    id: "zeta",
                    tools: true,
                    output_modalities: ["text"],
                    input_modalities: ["text"],
                    supported_endpoints: ["/v1/chat/completions"],
                    context_length: 1000,
                },
                {
                    id: "alpha",
                    tools: true,
                    output_modalities: ["text"],
                    input_modalities: ["text"],
                    supported_endpoints: ["/v1/chat/completions"],
                    context_length: 1000,
                },
            ]),
        );

        await pi.on(ctx, {});

        expect(readJson(settingsFile()).defaultModel).toBe("alpha");
    });

    it("stops before network or key work when Pi is not installed", async () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error("not installed");
        });
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);

        await expect(pi.on(ctx, {})).resolves.toMatchObject({
            harness: "pi",
            configured: false,
        });
        expect(fetch).not.toHaveBeenCalled();
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("stops before network, login, or config mutation for a conflicting skill", async () => {
        mkdirSync(join(agentDir(), "skills", "polli"), { recursive: true });
        writeFileSync(skillFile(), "user-owned skill");
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);

        await expect(pi.on(ctx, {})).rejects.toThrow(/already owned/);
        expect(fetch).not.toHaveBeenCalled();
        expect(read(skillFile())).toBe("user-owned skill");
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(authFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("validates the requested model before any key validation or minting", async () => {
        const requests: { url: string; authorization?: string }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                requests.push({
                    url,
                    authorization:
                        new Headers(init?.headers).get("Authorization") ??
                        undefined,
                });
                return apiResponse({
                    data: models.map((model) => ({
                        id: model.id,
                        tools: true,
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        context_length: model.contextWindow,
                        input_modalities: model.input,
                    })),
                });
            }),
        );

        await expect(pi.on(ctx, { model: "not-a-model" })).rejects.toThrow(
            /not-a-model/,
        );
        expect(requests).toHaveLength(1);
        expect(requests[0].url).toContain("/v1/models");
        expect(requests[0].authorization).toBeUndefined();
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("does not mint or write config when the public catalog preflight fails", async () => {
        const requests: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                requests.push(url);
                return apiResponse({ error: "catalog unavailable" }, 503);
            }),
        );

        await expect(pi.on(ctx, { model: "deepseek" })).rejects.toThrow(/503/);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toContain("/v1/models");
        expect(snapshotFiles()).toHaveLength(0);
        expect(existsSync(agentDir())).toBe(false);
    });

    it("uses an existing valid key before catalog selection", async () => {
        mkdirSync(agentDir(), { recursive: true });
        writeFileSync(
            authFile(),
            JSON.stringify({
                pollinations: { type: "api_key", key: "  sk_test_key  " },
            }),
        );
        const requests: { url: string; authorization?: string }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                requests.push({
                    url,
                    authorization:
                        new Headers(init?.headers).get("Authorization") ??
                        undefined,
                });
                if (url.endsWith("/account/key"))
                    return apiResponse({ valid: true });
                return apiResponse({
                    data: models.map((model) => ({
                        id: model.id,
                        tools: true,
                        output_modalities: ["text"],
                        supported_endpoints: ["/v1/chat/completions"],
                        context_length: model.contextWindow,
                        input_modalities: model.input,
                    })),
                });
            }),
        );

        await pi.on(ctx, { model: "kimi" });
        expect(requests.map(({ url }) => url)).toEqual([
            expect.stringContaining("/account/key"),
            expect.stringContaining("/v1/models"),
        ]);
        expect(requests[0].authorization).toBe("Bearer sk_test_key");
        expect(requests[1].authorization).toBe("Bearer sk_test_key");
        expect(readJson(authFile()).pollinations).toEqual({
            type: "api_key",
            key: "sk_test_key",
        });
    });

    it("status requires exact local readiness plus valid key and live compatibility", async () => {
        configurePi(ctx, settings);
        vi.stubGlobal("fetch", liveFetch());
        await expect(pi.status(ctx)).resolves.toMatchObject({
            configured: true,
            model: "deepseek",
        });

        const settingsData = readJson(settingsFile());
        settingsData.defaultModel = "removed-model";
        writeFileSync(
            settingsFile(),
            `${JSON.stringify(settingsData, null, 2)}\n`,
        );
        await expect(pi.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
    });

    it("status does not claim readiness for invalid credentials or a custom skill", async () => {
        configurePi(ctx, settings);
        vi.stubGlobal("fetch", liveFetch(models, false));
        await expect(pi.status(ctx)).resolves.toMatchObject({
            configured: false,
        });

        vi.stubGlobal("fetch", liveFetch());
        writeFileSync(skillFile(), "user-edited skill");
        await expect(pi.status(ctx)).resolves.toMatchObject({
            configured: false,
        });
        expect(JSON.stringify(await pi.status(ctx))).not.toContain(
            "sk_test_key",
        );
    });
});
