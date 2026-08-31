import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import * as harnessFs from "./fs.js";
import { configurePrime, disablePrime, prime, primeHome } from "./prime.js";
import type { HarnessContext, HarnessResult } from "./types.js";

const settings = {
    apiKey: "sk_test_key",
    model: "openai",
    models: [
        { id: "openai", contextWindow: 128000, input: ["text", "image"] },
        { id: "deepseek", contextWindow: 65536, input: ["text"] },
    ],
};

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-prime-"));
    ctx = { home, env: { PATH: "" } };
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/account/key")) {
                return new Response('{"valid":true}', { status: 200 });
            }
            if (url.endsWith("/v1/models")) {
                return new Response(
                    JSON.stringify({
                        data: [
                            {
                                id: "openai",
                                tools: true,
                                output_modalities: ["text"],
                                input_modalities: ["text", "image"],
                                supported_endpoints: ["/v1/chat/completions"],
                                context_length: 128000,
                            },
                            {
                                id: "deepseek",
                                tools: true,
                                output_modalities: ["text"],
                                input_modalities: ["text"],
                                supported_endpoints: ["/v1/chat/completions"],
                                context_length: 65536,
                            },
                        ],
                    }),
                    { status: 200 },
                );
            }
            return new Response("not found", { status: 404 });
        }),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    setKeyOverride("");
    rmSync(home, { recursive: true, force: true });
});

const modelsFile = (context = ctx) => join(primeHome(context), "models.json");
const settingsFile = (context = ctx) =>
    join(primeHome(context), "settings.json");
const skillFile = (context = ctx) =>
    join(primeHome(context), "skills", "polli", "SKILL.md");
const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) => JSON.parse(read(path));
const snapshotFiles = () => {
    const directory = join(home, ".pollinations", "harnesses");
    return existsSync(directory)
        ? readdirSync(directory).filter((file) => file.startsWith("prime."))
        : [];
};
const primeStatus = async (context = ctx) =>
    (await prime.status(context)) as HarnessResult;

describe("prime harness", () => {
    it("uses the default and PRIME_AGENT_CODING_AGENT_DIR config paths", () => {
        configurePrime(ctx, settings);
        expect(existsSync(modelsFile())).toBe(true);
        expect(existsSync(settingsFile())).toBe(true);
        expect(existsSync(skillFile())).toBe(true);

        const customHome = join(home, "custom-prime-agent");
        const customContext = {
            home,
            env: {
                PATH: "",
                PRIME_AGENT_CODING_AGENT_DIR: customHome,
            },
        };
        configurePrime(customContext, settings);
        expect(existsSync(modelsFile(customContext))).toBe(true);
        expect(existsSync(settingsFile(customContext))).toBe(true);
        expect(existsSync(skillFile(customContext))).toBe(true);
        expect(existsSync(join(home, ".prime", "agent", "settings.json"))).toBe(
            true,
        );
    });

    it("preserves slash-containing model IDs in the emitted provider config", () => {
        const model = "z-ai/glm-5.3-flash";
        configurePrime(ctx, {
            ...settings,
            model,
            models: [
                ...settings.models,
                { id: model, contextWindow: 65536, input: ["text"] },
            ],
        });

        const provider = readJson(modelsFile()).providers.pollinations;
        expect(
            provider.models.map((entry: { id: string }) => entry.id),
        ).toContain(model);
        expect(readJson(settingsFile()).defaultModel).toBe(model);
    });

    it("preserves providers/models/settings while merging live model metadata", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                schemaVersion: 3,
                providers: {
                    anthropic: { api: "anthropic-messages" },
                    pollinations: {
                        apiKey: "sk_previous",
                        models: [
                            { id: "custom-local", name: "My local model" },
                            { id: "openai", contextWindow: 1 },
                        ],
                    },
                },
            }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({ theme: "light", defaultThinkingLevel: "high" }),
        );

        const result = configurePrime(ctx, {
            ...settings,
            model: "deepseek",
        });
        const document = readJson(modelsFile());
        const provider = document.providers.pollinations;
        expect(result).toMatchObject({
            harness: "prime",
            configured: true,
            model: "deepseek",
        });
        expect(document.schemaVersion).toBe(3);
        expect(document.providers.anthropic).toEqual({
            api: "anthropic-messages",
        });
        expect(provider).toMatchObject({
            api: "openai-completions",
            baseUrl: "https://gen.pollinations.ai/v1",
            apiKey: "sk_test_key",
        });
        expect(
            provider.models.map((model: { id: string }) => model.id),
        ).toEqual(["deepseek", "openai", "custom-local"]);
        expect(provider.models[2]).toEqual({
            id: "custom-local",
            name: "My local model",
        });
        expect(readJson(settingsFile())).toMatchObject({
            theme: "light",
            defaultThinkingLevel: "high",
            defaultProvider: "pollinations",
            defaultModel: "deepseek",
        });
    });

    it("writes both Prime defaults using the official top-level settings schema", () => {
        configurePrime(ctx, settings);
        expect(readJson(settingsFile())).toMatchObject({
            defaultProvider: "pollinations",
            defaultModel: "openai",
        });
        expect(readJson(modelsFile()).providers.pollinations).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            api: "openai-completions",
        });
    });

    it("normalizes a secret key once before Prime persistence", () => {
        configurePrime(ctx, { ...settings, apiKey: "  sk_test_key  " });
        expect(readJson(modelsFile()).providers.pollinations.apiKey).toBe(
            "sk_test_key",
        );
    });

    it("does not overwrite an existing user skill", async () => {
        mkdirSync(join(primeHome(ctx), "skills", "polli"), { recursive: true });
        const userSkill = "---\nname: my-skill\n---\nuser-owned\n";
        writeFileSync(skillFile(), userSkill);

        expect(() => configurePrime(ctx, settings)).toThrow(
            /already exists and is not managed by Pollinations/,
        );

        expect(read(skillFile())).toBe(userSkill);
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect((await primeStatus()).configured).toBe(false);
    });

    it("rejects a conflicting skill before catalog or key requests", async () => {
        const bin = join(home, "bin");
        mkdirSync(bin, { recursive: true });
        writeFileSync(join(bin, "prime-agent"), "prime agent\n", {
            mode: 0o755,
        });
        mkdirSync(join(primeHome(ctx), "skills", "polli"), {
            recursive: true,
        });
        writeFileSync(skillFile(), "user-owned skill\n");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            prime.on({ ...ctx, env: { ...ctx.env, PATH: bin } }, {}),
        ).rejects.toThrow(/already exists and is not managed/);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(snapshotFiles()).toHaveLength(0);
        expect(existsSync(modelsFile())).toBe(false);
    });

    it("fails with safe install guidance when Prime Agent is unavailable", async () => {
        await expect(prime.on(ctx, {})).rejects.toThrow(
            process.platform === "win32"
                ? "official Windows installer"
                : "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",
        );
        expect(existsSync(modelsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("detects Prime Agent on PATH, filters live models, and reuses a valid key", async () => {
        const bin = join(home, "bin");
        mkdirSync(bin, { recursive: true });
        writeFileSync(
            join(
                bin,
                process.platform === "win32"
                    ? "prime-agent.cmd"
                    : "prime-agent",
            ),
            "prime agent\n",
            { mode: 0o755 },
        );
        mkdirSync(primeHome(ctx), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: { pollinations: { apiKey: "sk_existing" } },
            }),
        );

        const requests: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                requests.push(url);
                if (url.endsWith("/v1/models")) {
                    return new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "openai",
                                    tools: true,
                                    output_modalities: ["text"],
                                    input_modalities: ["text", "image"],
                                    supported_endpoints: [
                                        "/v1/chat/completions",
                                    ],
                                    context_length: 128000,
                                },
                                {
                                    id: "deepseek",
                                    tools: true,
                                    output_modalities: ["text"],
                                    input_modalities: ["text"],
                                    supported_endpoints: [
                                        "/v1/chat/completions",
                                    ],
                                    context_length: 65536,
                                },
                                {
                                    id: "no-tools",
                                    tools: false,
                                    output_modalities: ["text"],
                                    context_length: 128000,
                                },
                                {
                                    id: "image-model",
                                    tools: true,
                                    output_modalities: ["image"],
                                    context_length: 128000,
                                },
                                {
                                    id: "owner/agent",
                                    tools: true,
                                    output_modalities: ["text"],
                                    context_length: 128000,
                                },
                                {
                                    id: "published-agent",
                                    tools: true,
                                    output_modalities: ["text"],
                                    context_length: 128000,
                                    agent: { id: "agent" },
                                },
                            ],
                        }),
                        { status: 200 },
                    );
                }
                if (url.endsWith("/account/key")) {
                    return new Response('{"valid":true}', { status: 200 });
                }
                return new Response("not found", { status: 404 });
            }),
        );

        const result = await prime.on(
            { ...ctx, env: { ...ctx.env, PATH: bin } },
            {},
        );

        expect(result).toMatchObject({ configured: true, model: "openai" });
        expect(
            readJson(
                modelsFile({ ...ctx, env: { ...ctx.env, PATH: bin } }),
            ).providers.pollinations.models.map(
                (model: { id: string }) => model.id,
            ),
        ).toEqual(["openai", "deepseek"]);
        expect(requests).toEqual([
            "https://gen.pollinations.ai/v1/models",
            "https://gen.pollinations.ai/account/key",
            "https://gen.pollinations.ai/v1/models",
        ]);
        expect(JSON.stringify(result)).not.toContain("sk_existing");
    });

    it("rejects an unavailable selected model before creating a snapshot", async () => {
        const bin = join(home, "bin");
        mkdirSync(bin, { recursive: true });
        writeFileSync(
            join(
                bin,
                process.platform === "win32"
                    ? "prime-agent.cmd"
                    : "prime-agent",
            ),
            "prime agent\n",
            { mode: 0o755 },
        );
        mkdirSync(primeHome(ctx), { recursive: true });
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "deepseek",
                                    tools: true,
                                    output_modalities: ["text"],
                                    context_length: 65536,
                                },
                            ],
                        }),
                        { status: 200 },
                    ),
            ),
        );

        await expect(
            prime.on(
                { ...ctx, env: { ...ctx.env, PATH: bin } },
                {
                    model: "openai",
                },
            ),
        ).rejects.toThrow('Model "openai" is not a tool-calling text model');
        expect(existsSync(modelsFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("rejects malformed models.json or settings.json before any write", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        const originalSettings = '{"mine":true}\n';
        writeFileSync(modelsFile(), "{bad json");
        writeFileSync(settingsFile(), originalSettings);

        expect(() => configurePrime(ctx, settings)).toThrow(/not valid JSON/);
        expect(read(modelsFile())).toBe("{bad json");
        expect(read(settingsFile())).toBe(originalSettings);
        expect(snapshotFiles()).toHaveLength(0);

        writeFileSync(modelsFile(), "{}\n");
        writeFileSync(settingsFile(), "[]\n");
        expect(() => configurePrime(ctx, settings)).toThrow(
            /must contain a JSON object/,
        );
        expect(read(modelsFile())).toBe("{}\n");
        expect(read(settingsFile())).toBe("[]\n");
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("rolls back an existing-key setup when local validation reports false", async () => {
        const bin = join(home, "bin");
        mkdirSync(bin, { recursive: true });
        writeFileSync(join(bin, "prime-agent"), "prime agent\n", {
            mode: 0o755,
        });
        mkdirSync(primeHome(ctx), { recursive: true });
        const originalModels =
            '{"providers":{"pollinations":{"apiKey":"sk_existing"}}}\n';
        const originalSettings = '{"userSetting":true}\n';
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(settingsFile(), originalSettings);

        const realWrite = harnessFs.writeTextAtomic;
        let corruptFirstModelsWrite = true;
        vi.spyOn(harnessFs, "writeTextAtomic").mockImplementation(
            (path, text, mode) => {
                realWrite(path, text, mode);
                if (corruptFirstModelsWrite && path === modelsFile()) {
                    corruptFirstModelsWrite = false;
                    writeFileSync(path, "{}\n");
                }
            },
        );
        const requests: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                requests.push(`${init?.method ?? "GET"} ${url}`);
                if (url.endsWith("/account/key")) {
                    return new Response('{"valid":true}', { status: 200 });
                }
                if (url.endsWith("/v1/models")) {
                    return new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "openai",
                                    tools: true,
                                    output_modalities: ["text"],
                                    input_modalities: ["text"],
                                    supported_endpoints: [
                                        "/v1/chat/completions",
                                    ],
                                    context_length: 128000,
                                },
                            ],
                        }),
                        { status: 200 },
                    );
                }
                return new Response("not found", { status: 404 });
            }),
        );

        await expect(
            prime.on({ ...ctx, env: { ...ctx.env, PATH: bin } }, {}),
        ).rejects.toThrow(/failed local validation/);
        expect(read(modelsFile())).toBe(originalModels);
        expect(read(settingsFile())).toBe(originalSettings);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(requests.some((request) => request.startsWith("DELETE "))).toBe(
            false,
        );
    });

    it("revokes a newly created key when keyed setup fails", async () => {
        const bin = join(home, "bin");
        mkdirSync(bin, { recursive: true });
        writeFileSync(join(bin, "prime-agent"), "prime agent\n", {
            mode: 0o755,
        });
        setKeyOverride("sk_account");
        let keyedCatalogCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.endsWith("/v1/models")) {
                    const authorization = String(
                        (init?.headers as Record<string, string> | undefined)
                            ?.Authorization ?? "",
                    );
                    const keyed =
                        authorization.includes("sk_account") ||
                        authorization.includes("sk_child");
                    if (keyed) {
                        keyedCatalogCalls += 1;
                        if (keyedCatalogCalls === 2) {
                            mkdirSync(join(primeHome(ctx), "skills", "polli"), {
                                recursive: true,
                            });
                            writeFileSync(skillFile(), "user-owned\n");
                        }
                    }
                    return new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "openai",
                                    tools: true,
                                    output_modalities: ["text"],
                                    input_modalities: ["text"],
                                    supported_endpoints: [
                                        "/v1/chat/completions",
                                    ],
                                    context_length: 128000,
                                },
                            ],
                        }),
                        { status: 200 },
                    );
                }
                if (url.endsWith("/account/keys") && init?.method === "POST") {
                    return new Response(
                        JSON.stringify({ id: "child-id", key: "sk_child" }),
                        { status: 200 },
                    );
                }
                if (url.endsWith("/api/account/keys")) {
                    return new Response(JSON.stringify({ data: [] }), {
                        status: 200,
                    });
                }
                if (
                    url.endsWith("/account/keys/child-id") &&
                    init?.method === "DELETE"
                ) {
                    return new Response("{}", { status: 200 });
                }
                return new Response("not found", { status: 404 });
            }),
        );

        await expect(
            prime.on({ ...ctx, env: { ...ctx.env, PATH: bin } }, {}),
        ).rejects.toThrow(/already exists and is not managed/);
        const calls = (
            vi.mocked(fetch).mock.calls as Array<
                [RequestInfo | URL, RequestInit?]
            >
        ).map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`);
        expect(calls).toContain(
            "DELETE https://gen.pollinations.ai/account/keys/child-id",
        );
    });

    it("migrates the legacy keyed snapshot schema without changing its paths", () => {
        configurePrime(ctx, settings);
        const snapshotPath = join(
            home,
            ".pollinations",
            "harnesses",
            snapshotFiles()[0],
        );
        const current = readJson(snapshotPath);
        const legacy = {
            complete: current.complete,
            files: Object.fromEntries(
                Object.entries(current.files).map(([path, file]) => {
                    const entry = file as {
                        before: string | null;
                        afterHash: string | null;
                    };
                    return [
                        path,
                        {
                            before: entry.before,
                            afterHash: entry.afterHash,
                        },
                    ];
                }),
            ),
        };
        writeFileSync(snapshotPath, JSON.stringify(legacy));

        configurePrime(ctx, { ...settings, model: "deepseek" });
        const migrated = readJson(snapshotPath);
        expect(migrated.version).toBe(1);
        expect(Object.keys(migrated.files)).toEqual(Object.keys(current.files));
        expect(migrated.files[modelsFile()].before).toBeNull();
        expect(migrated.files[modelsFile()].beforeEncoding).toBe("base64");
    });

    it("rolls back every Prime file when a later write fails", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        const blocker = join(primeHome(ctx), "skills", "polli");
        mkdirSync(join(primeHome(ctx), "skills"), { recursive: true });
        writeFileSync(blocker, "not a directory");

        expect(() => configurePrime(ctx, settings)).toThrow();
        expect(existsSync(modelsFile())).toBe(false);
        expect(existsSync(settingsFile())).toBe(false);
        expect(read(blocker)).toBe("not a directory");
        expect(snapshotFiles()).toHaveLength(0);
    });

    it.each([
        [
            "base URL",
            (provider: Record<string, unknown>) => {
                provider.baseUrl = "https://example.test/v1";
            },
        ],
        [
            "API",
            (provider: Record<string, unknown>) => {
                provider.api = "anthropic-messages";
            },
        ],
        [
            "credential",
            (provider: Record<string, unknown>) => {
                provider.apiKey = "";
            },
        ],
        [
            "compatibility",
            (provider: Record<string, unknown>) => {
                (
                    provider.compat as Record<string, unknown>
                ).supportsDeveloperRole = true;
            },
        ],
    ])("reports false for an invalid %s", async (_name, mutate) => {
        configurePrime(ctx, settings);
        const document = readJson(modelsFile());
        mutate(document.providers.pollinations);
        writeFileSync(modelsFile(), JSON.stringify(document));
        expect((await primeStatus()).configured).toBe(false);
    });

    it("strictly validates Prime defaults, selected model, and skill readiness", async () => {
        configurePrime(ctx, settings);
        const settingsDocument = readJson(settingsFile());
        settingsDocument.defaultProvider = "anthropic";
        writeFileSync(settingsFile(), JSON.stringify(settingsDocument));
        expect((await primeStatus()).configured).toBe(false);

        settingsDocument.defaultProvider = "pollinations";
        settingsDocument.defaultModel = "missing-model";
        writeFileSync(settingsFile(), JSON.stringify(settingsDocument));
        expect((await primeStatus()).configured).toBe(false);

        writeFileSync(
            settingsFile(),
            JSON.stringify({
                defaultProvider: "pollinations",
                defaultModel: "openai",
            }),
        );
        writeFileSync(skillFile(), "user changed this skill\n");
        expect((await primeStatus()).configured).toBe(false);
        expect(JSON.stringify(await primeStatus())).not.toContain(
            "sk_test_key",
        );
    });

    it("reports false when the selected model is missing from the live catalog", async () => {
        configurePrime(ctx, settings);
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.endsWith("/account/key")) {
                    return new Response('{"valid":true}', { status: 200 });
                }
                if (url.endsWith("/v1/models")) {
                    return new Response(
                        JSON.stringify({
                            data: [
                                {
                                    id: "deepseek",
                                    tools: true,
                                    output_modalities: ["text"],
                                    input_modalities: ["text"],
                                    supported_endpoints: [
                                        "/v1/chat/completions",
                                    ],
                                    context_length: 65536,
                                },
                            ],
                        }),
                        { status: 200 },
                    );
                }
                return new Response("not found", { status: 404 });
            }),
        );

        expect((await primeStatus()).configured).toBe(false);
    });

    it("preserves user fields on a newly created provider during surgical cleanup", () => {
        configurePrime(ctx, settings);
        const modelsDocument = readJson(modelsFile());
        modelsDocument.providers.pollinations.userField = { keep: true };
        writeFileSync(modelsFile(), JSON.stringify(modelsDocument));

        expect(disablePrime(ctx).outcome).toBe("stripped");
        expect(readJson(modelsFile()).providers.pollinations).toEqual({
            userField: { keep: true },
        });
    });

    it("restores unchanged files byte-for-byte and makes off idempotent", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        const originalModels =
            '{"providers":{"anthropic":{"api":"anthropic-messages"}}}\n';
        const originalSettings = '{"theme":"dark"}\n';
        writeFileSync(modelsFile(), originalModels);
        writeFileSync(settingsFile(), originalSettings);

        configurePrime(ctx, settings);
        expect(snapshotFiles()).toHaveLength(1);
        expect(disablePrime(ctx).outcome).toBe("restored");
        expect(read(modelsFile())).toBe(originalModels);
        expect(read(settingsFile())).toBe(originalSettings);
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(disablePrime(ctx).outcome).toBe("unchanged");
    });

    it("keeps rerun ownership metadata sticky for surgical cleanup", () => {
        configurePrime(ctx, settings);
        const modelsDocument = readJson(modelsFile());
        modelsDocument.userEdit = true;
        writeFileSync(modelsFile(), JSON.stringify(modelsDocument));

        configurePrime(ctx, { ...settings, model: "deepseek" });
        expect(disablePrime(ctx).outcome).toBe("stripped");
        expect(readJson(modelsFile()).userEdit).toBe(true);
        expect(readJson(modelsFile()).providers).toBeUndefined();
    });

    it("surgically removes Pollinations entries after unrelated user edits", () => {
        configurePrime(ctx, settings);

        const modelsDocument = readJson(modelsFile());
        modelsDocument.providers.local = {
            baseUrl: "http://localhost:11434/v1",
        };
        writeFileSync(modelsFile(), JSON.stringify(modelsDocument, null, 2));
        const settingsDocument = readJson(settingsFile());
        settingsDocument.userSetting = { keep: true };
        writeFileSync(
            settingsFile(),
            JSON.stringify(settingsDocument, null, 2),
        );

        const result = disablePrime(ctx);
        expect(result.outcome).toBe("stripped");
        const updatedModels = readJson(modelsFile());
        expect(updatedModels.providers.local).toEqual({
            baseUrl: "http://localhost:11434/v1",
        });
        expect(updatedModels.providers.pollinations).toBeUndefined();
        const updatedSettings = readJson(settingsFile());
        expect(updatedSettings.userSetting).toEqual({ keep: true });
        expect(updatedSettings.defaultProvider).toBeUndefined();
        expect(updatedSettings.defaultModel).toBeUndefined();
        expect(existsSync(skillFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(disablePrime(ctx).outcome).toBe("unchanged");
    });

    it("preserves a user-edited skill during surgical cleanup", () => {
        configurePrime(ctx, settings);
        const editedSkill = `${read(skillFile())}\n# user note\n`;
        writeFileSync(skillFile(), editedSkill);
        const document = readJson(settingsFile());
        document.userSetting = true;
        writeFileSync(settingsFile(), JSON.stringify(document));

        expect(disablePrime(ctx).outcome).toBe("stripped");
        expect(read(skillFile())).toBe(editedSkill);
        expect(readJson(modelsFile()).providers).toBeUndefined();
        expect(readJson(settingsFile()).userSetting).toBe(true);
    });

    it("keeps a pre-existing Pollinations provider when off has to strip unrelated edits", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        const originalProvider = {
            api: "openai-completions",
            baseUrl: "https://proxy.example/v1",
            apiKey: "sk_user_key",
            models: [{ id: "user-model" }],
        };
        writeFileSync(
            modelsFile(),
            JSON.stringify({ providers: { pollinations: originalProvider } }),
        );
        configurePrime(ctx, settings);
        const document = readJson(modelsFile());
        document.providers.local = { baseUrl: "http://localhost:11434/v1" };
        document.providers.pollinations.headers = { "x-user": "keep" };
        writeFileSync(modelsFile(), JSON.stringify(document));

        expect(disablePrime(ctx).outcome).toBe("stripped");
        expect(readJson(modelsFile()).providers.pollinations).toEqual({
            ...originalProvider,
            headers: { "x-user": "keep" },
        });
        expect(readJson(modelsFile()).providers.local).toBeDefined();
    });

    it("restores pre-existing defaults during surgical cleanup", () => {
        mkdirSync(primeHome(ctx), { recursive: true });
        writeFileSync(
            modelsFile(),
            JSON.stringify({
                providers: { anthropic: { models: [{ id: "claude" }] } },
            }),
        );
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                defaultProvider: "anthropic",
                defaultModel: "claude",
            }),
        );
        configurePrime(ctx, settings);
        const document = readJson(settingsFile());
        document.userSetting = true;
        writeFileSync(settingsFile(), JSON.stringify(document));

        expect(disablePrime(ctx).outcome).toBe("stripped");
        expect(readJson(settingsFile())).toEqual({
            defaultProvider: "anthropic",
            defaultModel: "claude",
            userSetting: true,
        });
    });

    it("does not expose the credential in status output", async () => {
        configurePrime(ctx, settings);
        expect(JSON.stringify(await primeStatus())).not.toContain(
            "sk_test_key",
        );
        unlinkSync(skillFile());
        expect(JSON.stringify(await primeStatus())).not.toContain(
            "sk_test_key",
        );
    });
});
