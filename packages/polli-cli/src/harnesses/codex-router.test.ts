import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    codex,
    codexHome,
    codexRouterRoot,
    configureCodexRouter,
    disableCodexRouter,
} from "./codex-router.js";
import type { HarnessContext } from "./types.js";

const hoisted = vi.hoisted(() => ({
    calls: [] as { script: string; args: string[] }[],
    codexDir: "",
    status: 0,
    handlers: {} as Record<string, (args: string[]) => void>,
}));

vi.mock("node:child_process", () => ({
    spawnSync: (_file: string, args: string[]) => {
        const script = String(args[0]).split("/").pop() ?? "";
        hoisted.calls.push({ script, args: args.slice(1) });
        hoisted.handlers[script]?.(args.slice(1));
        return { status: hoisted.status, stdout: "", stderr: "" };
    },
}));

vi.mock("./keys.js", () => ({
    resolveHarnessKey: vi.fn(async () => "sk_test_key"),
}));

vi.mock("./models.js", () => ({
    fetchHarnessModels: vi.fn(async (model: string) => [
        { id: model, contextWindow: 128_000, input: ["text"] },
        { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
    ]),
}));

const ROUTER_SOURCE = "/opt/codex-router";

let home: string;
let ctx: HarnessContext;

const codexDir = () => join(home, ".codex");
const stateDir = () => join(codexDir(), "codex-router");
const configPath = () => join(codexDir(), "config.toml");
const providersPath = () => join(stateDir(), "generic-providers.json");
const credentialsPath = () => join(stateDir(), "provider-credentials.json");
const keyPath = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const read = (path: string) =>
    existsSync(path) ? readFileSync(path, "utf-8") : null;

const writeJson = (path: string, value: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

/** Put a fake `codex` binary on PATH so the client check passes. */
const installFakeCodex = () => {
    const bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "codex"), "#!/bin/sh\n");
    chmodSync(join(bin, "codex"), 0o755);
};

/** Pretend Codex Router is installed and running from ROUTER_SOURCE. */
const installFakeRouter = () => {
    writeJson(join(stateDir(), "install-manifest.json"), {
        version: 1,
        current: { sourceRoot: ROUTER_SOURCE, packageVersion: "0.6.0" },
    });
    mkdirSync(join(ROUTER_SOURCE, "src"), { recursive: true });
    writeFileSync(join(ROUTER_SOURCE, "src", "providers.mjs"), "");
};

const userConfig = () => `model = "gpt-5.2-codex"
model_provider = "openai"

[model_providers.openai]
name = "OpenAI"
`;

const routerHandlers = {
    "providers.mjs": (args: string[]) => {
        const [, action, id] = args;
        const path = join(hoisted.codexDir, "codex-router", "generic-providers.json");
        const store = existsSync(path)
            ? readJson(path)
            : { version: 1, providers: [] };
        const value = (flag: string) => args[args.indexOf(flag) + 1];
        if (action === "add" || action === "edit") {
            const entry = {
                id,
                displayName: value("--name"),
                baseUrl: value("--base-url"),
                adapter: value("--adapter"),
                headers: {},
                credentialRef: value("--credential-ref"),
                allowPrivate: false,
                enabled: true,
            };
            store.providers = [
                ...(store.providers ?? []).filter(
                    (provider: { id: string }) => provider.id !== id,
                ),
                entry,
            ];
            writeJson(path, store);
        } else if (action === "remove") {
            store.providers = (store.providers ?? []).filter(
                (provider: { id: string }) => provider.id !== id,
            );
            writeJson(path, store);
        }
    },
    "curate-models.mjs": (args: string[]) => {
        const provider = args[0] ?? "";
        const models = (args[args.indexOf("--models") + 1] ?? "")
            .split(",")
            .filter(Boolean);
        writeJson(join(hoisted.codexDir, "codex-router", "user-models.json"), {
            version: 1,
            models: models.map((id) => ({
                slug: `${provider}/${id}`,
                gatewayModel: `${provider}-${id}`,
                upstreamModel: id,
                provider,
                listed: true,
            })),
        });
        writeJson(join(hoisted.codexDir, "codex-router", "merged-models.json"), {
            models: models,
        });
    },
    "config-manager.mjs": (args: string[]) => {
        const [command, model] = args;
        const target = join(hoisted.codexDir, "config.toml");
        const state = join(hoisted.codexDir, "codex-router");
        const current = read(target) ?? "";
        if (command === "enable") {
            writeFileSync(
                target,
                `${current}# >>> codex-router start\nopenai_base_url = "http://127.0.0.1:4202/v1"\n# <<< codex-router end\n`,
            );
        } else if (command === "router-default-set") {
            const stripped = current.replace(/^\s*model\s*=.*\n/mu, "");
            writeFileSync(target, `model = "${model}"\n${stripped}`);
            writeJson(join(state, "codex-default-model.json"), {
                version: 1,
                model,
                previousPresent: true,
                previousModel: "gpt-5.2-codex",
            });
        } else if (command === "router-default-clear") {
            const statePath = join(state, "codex-default-model.json");
            const recorded = existsSync(statePath) ? readJson(statePath) : undefined;
            const fixed = /^\s*model\s*=\s*"([^"]*)"/mu.exec(current)?.[1];
            if (recorded && fixed === recorded.model) {
                writeFileSync(target, current.replace(/^\s*model\s*=.*\n/mu, ""));
            }
            rmSync(statePath, { force: true });
        }
    },
};

const setup = (env: NodeJS.ProcessEnv = {}) => {
    ctx = { home, env };
    return ctx;
};

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    hoisted.calls = [];
    hoisted.status = 0;
    hoisted.handlers = { ...routerHandlers };
    rmSync(ROUTER_SOURCE, { recursive: true, force: true });
    mkdirSync(codexDir(), { recursive: true });
    writeFileSync(configPath(), userConfig());
    installFakeCodex();
    installFakeRouter();
    hoisted.codexDir = codexDir();
    ctx = setup({ PATH: join(home, "bin") });
});

afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(ROUTER_SOURCE, { recursive: true, force: true });
});

describe("codex harness", () => {
    it("registers the provider, curates models, and sets the router default", () => {
        const state = configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [
                { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
            ],
            root: ROUTER_SOURCE,
        });

        expect(state.configured).toBe(true);
        expect(state.model).toBe("openai/gpt-5.4-nano");

        const provider = readJson(providersPath()).providers[0];
        expect(provider.id).toBe("pollinations");
        expect(provider.baseUrl).toBe("https://gen.pollinations.ai/v1");
        expect(provider.adapter).toBe("openai-chat");
        expect(provider.credentialRef).toMatch(/^cred_/u);
        expect(read(keyPath())).toBe("sk_test_key\n");

        expect(readJson(join(stateDir(), "user-models.json")).models[0]).toMatchObject({
            provider: "pollinations",
            upstreamModel: "openai/gpt-5.4-nano",
        });
        expect(read(configPath())).toContain(
            'model = "pollinations/openai/gpt-5.4-nano"',
        );
    });

    it("drops a stale Pollinations model when the router state file is gone", () => {
        writeFileSync(
            configPath(),
            'model = "pollinations/openai/gpt-5.4-nano"\nmodel_provider = "openai"\n',
        );
        writeJson(providersPath(), {
            version: 1,
            providers: [
                {
                    id: "pollinations",
                    displayName: "Pollinations",
                    baseUrl: "https://gen.pollinations.ai/v1",
                    adapter: "openai-chat",
                    headers: {},
                    credentialRef: "cred_existing",
                    allowPrivate: false,
                    enabled: true,
                },
            ],
        });

        const result = disableCodexRouter(ctx);

        expect(result.outcome).toBe("stripped");
        expect(read(configPath())).not.toContain("pollinations/");
        expect(readJson(providersPath()).providers).toEqual([]);
    });

    it("reuses the recorded credential reference on a second run", () => {
        const models = [
            { id: "openai/gpt-5.4-nano", contextWindow: 400_000, input: ["text"] },
        ];
        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models,
            root: ROUTER_SOURCE,
        });
        const first = readJson(providersPath()).providers[0].credentialRef;
        const calls = hoisted.calls.length;

        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models,
            root: ROUTER_SOURCE,
        });

        const second = readJson(providersPath()).providers[0].credentialRef;
        expect(second).toBe(first);
        expect(readJson(credentialsPath()).credentials).toHaveLength(1);
        expect(hoisted.calls.length).toBeGreaterThan(calls);
        expect(
            hoisted.calls.some(
                (call) =>
                    call.script === "providers.mjs" && call.args[1] === "edit",
            ),
        ).toBe(true);
    });

    it("keeps unrelated providers and settings", () => {
        writeJson(providersPath(), {
            version: 1,
            providers: [
                {
                    id: "openrouter",
                    displayName: "OpenRouter",
                    baseUrl: "https://openrouter.ai/api/v1",
                    adapter: "openai-chat",
                    headers: {},
                    credentialRef: "cred_keepme",
                    allowPrivate: false,
                    enabled: true,
                },
            ],
        });

        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
            root: ROUTER_SOURCE,
        });

        const providers = readJson(providersPath()).providers;
        expect(providers.map((provider: { id: string }) => provider.id)).toEqual([
            "openrouter",
            "pollinations",
        ]);
        expect(read(configPath())).toContain('[model_providers.openai]');
    });

    it("restores the original files byte-for-byte on off", () => {
        const before = {
            config: read(configPath()),
            providers: read(providersPath()),
            credentials: read(credentialsPath()),
            models: read(join(stateDir(), "user-models.json")),
        };

        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
            root: ROUTER_SOURCE,
        });

        const state = disableCodexRouter(ctx);

        expect(state.outcome).toBe("restored");
        expect(state.configured).toBe(false);
        expect(read(configPath())).toBe(before.config);
        expect(read(providersPath())).toBe(before.providers);
        expect(read(credentialsPath())).toBe(before.credentials);
        expect(read(join(stateDir(), "user-models.json"))).toBe(before.models);
        expect(existsSync(keyPath())).toBe(false);
        expect(existsSync(join(stateDir(), "codex-default-model.json"))).toBe(false);
    });

    it("only strips the Pollinations entries when the config changed since on", () => {
        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
            root: ROUTER_SOURCE,
        });
        writeFileSync(
            configPath(),
            `${read(configPath())}\n# edited by the user\n`,
        );

        const state = disableCodexRouter(ctx);

        expect(state.outcome).toBe("stripped");
        const text = read(configPath()) ?? "";
        expect(text).toContain("# edited by the user");
        expect(text).not.toContain("pollinations/");
        expect(
            readJson(providersPath()).providers.map(
                (provider: { id: string }) => provider.id,
            ),
        ).toEqual([]);
        expect(existsSync(keyPath())).toBe(false);
    });

    it("reports unchanged when off runs on a harness that was never on", () => {
        const before = read(configPath());
        const state = disableCodexRouter(ctx);

        expect(state.outcome).toBe("unchanged");
        expect(read(configPath())).toBe(before);
        expect(read(providersPath())).toBe(null);
    });

    it("reports unconfigured when the credential is missing", () => {
        configureCodexRouter(ctx, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
            root: ROUTER_SOURCE,
        });
        rmSync(keyPath(), { force: true });

        expect(codex.status(ctx).configured).toBe(false);
    });

    it("honors CODEX_HOME", () => {
        const custom = join(home, "custom-codex");
        const scoped = { home, env: { CODEX_HOME: custom, PATH: join(home, "bin") } };
        mkdirSync(join(custom, "codex-router"), { recursive: true });
        writeJson(join(custom, "codex-router", "install-manifest.json"), {
            version: 1,
            current: { sourceRoot: ROUTER_SOURCE },
        });
        writeFileSync(join(custom, "config.toml"), userConfig());
        hoisted.codexDir = custom;

        expect(codexHome(scoped)).toBe(custom);
        const state = configureCodexRouter(scoped, {
            apiKey: "sk_test_key",
            model: "openai/gpt-5.4-nano",
            models: [{ id: "openai/gpt-5.4-nano", contextWindow: 1, input: ["text"] }],
            root: ROUTER_SOURCE,
        });

        expect(state.configured).toBe(true);
        expect(existsSync(join(custom, "codex-router", "generic-providers.json"))).toBe(
            true,
        );
        expect(existsSync(join(codexDir(), "codex-router", "generic-providers.json"))).toBe(
            false,
        );
    });

    it("reads the router root from the install manifest", () => {
        expect(codexRouterRoot(ctx)).toBe(ROUTER_SOURCE);
        rmSync(join(stateDir(), "install-manifest.json"), { force: true });
        expect(codexRouterRoot(ctx)).toBe(null);
    });

    it("stops before configuration when Codex Router is unavailable", async () => {
        rmSync(join(stateDir(), "install-manifest.json"), { force: true });
        await expect(codex.on(ctx, {})).rejects.toThrow(
            "Codex Router was not found",
        );
    });

    it("stops before configuration when the Codex CLI is unavailable", async () => {
        ctx = setup({ PATH: join(home, "empty-bin") });
        await expect(codex.on(ctx, {})).rejects.toThrow("Codex was not found");
        expect(existsSync(providersPath())).toBe(false);
    });
});
