import {
    chmodSync,
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
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
    CodexStatePaths,
    RouterRun,
    RouterRunner,
    RouterRunResult,
} from "./codex.js";
import {
    codex,
    configureCodex,
    disableCodex,
    stateDir,
    statePaths,
} from "./codex.js";
import type { HarnessContext, HarnessResult } from "./types.js";

const PROVIDER_ID = "pollinations";
const MARKER = "polli harness codex";
const MODELS = [
    {
        id: "deepseek/deepseek-v4-flash",
        contextWindow: 1048576,
        input: ["text"],
    },
    {
        id: "openai/gpt-5-nano",
        contextWindow: 400000,
        input: ["text", "image"],
    },
];
const SETTINGS = {
    apiKey: "sk_test_key",
    model: "deepseek/deepseek-v4-flash",
    models: MODELS,
};

let home: string;
let ctx: HarnessContext;
let paths: () => CodexStatePaths;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-codex-harness-"));
    ctx = { home, env: {} };
    paths = () => statePaths(ctx);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const read = (path: string) => readFileSync(path, "utf-8");
const readJson = (path: string) =>
    JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
const writeJson = (path: string, value: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const readStatus = (c: HarnessContext): HarnessResult =>
    codex.status(c) as HarnessResult;

const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((file) => file.startsWith("codex."))
        : [];
};

const seedState = () => {
    const p = paths();
    writeJson(p.providers, {
        version: 1,
        providers: [
            {
                id: "ollama-cloud",
                displayName: "Ollama Cloud",
                baseUrl: "https://ollama.example/v1",
                adapter: "openai-chat",
                headers: {},
                enabled: true,
            },
        ],
    });
    writeJson(p.credentials, {
        schemaVersion: 2,
        credentials: [
            {
                id: "ollama-cloud-key",
                providerId: "ollama-cloud",
                providerType: "generic",
                kind: "api_key",
                state: "active",
                label: "ollama-cloud",
                secretRef: "ollama-cloud.key",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    });
    writeJson(p.userModels, {
        version: 1,
        models: [
            { provider: "ollama-cloud", slug: "ollama-cloud/gpt-oss:120b" },
        ],
    });
    writeJson(p.picker, {
        hidden: [],
        seeded: ["ollama-cloud/gpt-oss:120b"],
        visible: ["ollama-cloud/gpt-oss:120b"],
    });
};

const captureState = () => {
    const p = paths();
    return {
        providers: read(p.providers),
        credentials: read(p.credentials),
        userModels: read(p.userModels),
        picker: read(p.picker),
    };
};

const installFakeRouterCli = () => {
    const bin = join(home, ".local", "share", "codex-router", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "codex-router"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "codex-router"), 0o755);
    return join(bin, "codex-router");
};

const ok = (stdout: string): RouterRunResult => ({
    status: 0,
    stdout,
    stderr: "",
});

const parseFlags = (args: string[]) => {
    const flags: Record<string, string> = {};
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg.startsWith("--")) flags[arg] = args[index + 1] ?? "";
    }
    return flags;
};

const mutateProvider = (
    id: string,
    mutate: (provider: Record<string, unknown>) => void,
) => {
    const path = paths().providers;
    if (!existsSync(path)) return;
    const data = readJson(path);
    const providers = data.providers as Record<string, unknown>[];
    const provider = providers.find((entry) => entry.id === id);
    if (provider) {
        mutate(provider);
        writeJson(path, data);
    }
};

/** Mirrors the real CLI: mutates the same state files, key only via stdin. */
const dispatch = (run: RouterRun): RouterRunResult => {
    const [group, sub, action] = run.args;
    const p = paths();

    if (group === "providers" && sub === "generic" && action === "add") {
        const id = run.args[3];
        const flags = parseFlags(run.args.slice(4));
        const data = existsSync(p.providers)
            ? readJson(p.providers)
            : { version: 1, providers: [] };
        (data.providers as unknown[]).push({
            id,
            displayName: flags["--name"],
            baseUrl: flags["--base-url"],
            adapter: flags["--adapter"],
            description: flags["--description"],
            headers: {},
            allowPrivate: false,
            enabled: true,
        });
        writeJson(p.providers, data);
        return ok(JSON.stringify({ provider: { id } }));
    }

    if (group === "providers" && sub === "generic" && action === "enable") {
        mutateProvider(run.args[3], (provider) => {
            provider.enabled = true;
        });
        return ok(JSON.stringify({ provider: { id: run.args[3] } }));
    }

    if (group === "providers" && sub === "generic" && action === "credential") {
        const id = run.args[3];
        const credentialAction = run.args[4];
        if (credentialAction === "set") {
            const secret = (run.stdin ?? "").trim();
            if (!secret) {
                return { status: 1, stdout: "", stderr: "Empty credential." };
            }
            mkdirSync(dirname(p.key), { recursive: true, mode: 0o700 });
            writeFileSync(p.key, `${secret}\n`, { mode: 0o600 });
            const store = existsSync(p.credentials)
                ? readJson(p.credentials)
                : { schemaVersion: 2, credentials: [] };
            const entries = store.credentials as Record<string, unknown>[];
            const filtered = entries.filter((entry) => entry.providerId !== id);
            filtered.push({
                id: `${id}-key`,
                providerId: id,
                providerType: "generic",
                kind: "api_key",
                state: "active",
                label: id,
                secretRef: `${id}.key`,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            });
            store.credentials = filtered;
            writeJson(p.credentials, store);
            mutateProvider(id, (provider) => {
                provider.credentialRef = `${id}-key`;
            });
            return ok(
                JSON.stringify({
                    providerId: id,
                    credentialRef: `${id}-key`,
                    configured: true,
                }),
            );
        }
        if (credentialAction === "remove") {
            if (existsSync(p.credentials)) {
                const store = readJson(p.credentials);
                store.credentials = (
                    store.credentials as Record<string, unknown>[]
                ).filter((entry) => entry.providerId !== id);
                writeJson(p.credentials, store);
            }
            rmSync(p.key, { force: true });
            mutateProvider(id, (provider) => {
                delete provider.credentialRef;
            });
            return ok(JSON.stringify({ removed: true }));
        }
        return {
            status: 1,
            stdout: "",
            stderr: `Unknown credential action ${credentialAction}.`,
        };
    }

    if (group === "curate-models") {
        const flags = parseFlags(run.args.slice(2));
        const models = (flags["--models"] ?? "").split(",").filter(Boolean);
        const store = existsSync(p.userModels)
            ? readJson(p.userModels)
            : { version: 1, models: [] };
        const entries = (store.models as Record<string, unknown>[]).filter(
            (entry) => entry.provider !== PROVIDER_ID,
        );
        for (const [index, id] of models.entries()) {
            entries.push({
                slug: `${PROVIDER_ID}/${id}`,
                gatewayModel: `${PROVIDER_ID}-${id.replace(/[^a-z0-9]+/gi, "-")}`,
                upstreamModel: id,
                provider: PROVIDER_ID,
                listed: true,
                priority: 100 + index,
                requestProfile: PROVIDER_ID,
                defaultEffort: "high",
                reasoningLevels: [
                    { effort: "high", description: "Adaptive reasoning" },
                ],
                contextWindow: 1048576,
                autoCompact: 110000,
                inputModalities: ["text"],
                compHash: `${PROVIDER_ID}-user-v1`,
                displayName: id,
                description: `User-curated ${PROVIDER_ID} model`,
            });
        }
        store.models = entries;
        writeJson(p.userModels, store);

        const picker = existsSync(p.picker)
            ? readJson(p.picker)
            : { hidden: [], seeded: [], visible: [] };
        const ourSlugs = models.map((id) => `${PROVIDER_ID}/${id}`);
        picker.seeded = [
            ...new Set([...(picker.seeded as string[]), ...ourSlugs]),
        ].sort();
        picker.visible = [
            ...new Set([...(picker.visible as string[]), ...ourSlugs]),
        ].sort();
        writeJson(p.picker, picker);
        return ok("Curated models are live.");
    }

    return {
        status: 1,
        stdout: "",
        stderr: `unexpected call: ${run.args.join(" ")}`,
    };
};

interface FakeOptions {
    failOn?: string;
    partialWriteOnFail?: boolean;
}

const makeRouter = (options: FakeOptions = {}) => {
    const calls: RouterRun[] = [];
    const runner: RouterRunner = (run) => {
        calls.push(run);
        const joined = run.args.join(" ");
        if (options.failOn && joined.includes(options.failOn)) {
            if (options.partialWriteOnFail && run.args[0] === "curate-models") {
                writeJson(paths().userModels, {
                    version: 1,
                    models: [
                        {
                            provider: PROVIDER_ID,
                            slug: `${PROVIDER_ID}/halfwritten`,
                        },
                    ],
                });
            }
            return { status: 1, stdout: "", stderr: "simulated failure" };
        }
        return dispatch(run);
    };
    return { runner, calls };
};

describe("codex harness", () => {
    it("configures codex-router end to end and off restores byte-for-byte", () => {
        seedState();
        const before = captureState();
        installFakeRouterCli();
        const router = makeRouter();

        const result = configureCodex(ctx, SETTINGS, router.runner);
        expect(result).toMatchObject({ harness: "codex", configured: true });

        const p = paths();
        const providers = readJson(p.providers).providers as Record<
            string,
            unknown
        >[];
        const entry = providers.find((item) => item.id === PROVIDER_ID);
        expect(entry).toMatchObject({
            displayName: "Pollinations",
            baseUrl: "https://gen.pollinations.ai/v1",
            adapter: "openai-chat",
            enabled: true,
        });
        expect(String(entry?.description)).toContain(MARKER);
        expect(String(entry?.credentialRef)).toBe(`${PROVIDER_ID}-key`);

        const addCall = router.calls.find((call) => call.args[2] === "add");
        expect(addCall?.args).toEqual([
            "providers",
            "generic",
            "add",
            PROVIDER_ID,
            "--name",
            "Pollinations",
            "--base-url",
            "https://gen.pollinations.ai/v1",
            "--adapter",
            "openai-chat",
            "--description",
            expect.stringContaining(MARKER),
        ]);

        expect(read(p.key)).toBe(`${SETTINGS.apiKey}\n`);
        expect(statSync(p.key).mode & 0o777).toBe(0o600);

        const credentials = readJson(p.credentials).credentials as Record<
            string,
            unknown
        >[];
        expect(
            credentials.find((item) => item.providerId === PROVIDER_ID),
        ).toMatchObject({ kind: "api_key", state: "active" });

        const models = readJson(p.userModels).models as Record<
            string,
            unknown
        >[];
        expect(
            models.filter((item) => item.provider === PROVIDER_ID),
        ).toHaveLength(2);
        expect(models.some((item) => item.provider === "ollama-cloud")).toBe(
            true,
        );

        const picker = readJson(p.picker);
        expect(picker.seeded).toContain(
            `${PROVIDER_ID}/deepseek/deepseek-v4-flash`,
        );

        // The key travels only over stdin, never on argv.
        expect(
            router.calls.every(
                (call) => !call.args.join(" ").includes(SETTINGS.apiKey),
            ),
        ).toBe(true);
        const setCall = router.calls.find((call) => call.args.includes("set"));
        expect(setCall?.stdin).toBe(`${SETTINGS.apiKey}\n`);
        const curateCall = router.calls.find(
            (call) => call.args[0] === "curate-models",
        );
        expect(curateCall?.args).toEqual([
            "curate-models",
            PROVIDER_ID,
            "--models",
            "deepseek/deepseek-v4-flash,openai/gpt-5-nano",
            "--apply",
        ]);

        expect(readStatus(ctx).configured).toBe(true);
        expect(snapshotFiles()).toHaveLength(1);

        const outcome = disableCodex(ctx, router.runner);
        expect(outcome.outcome).toBe("restored");
        expect(read(p.providers)).toBe(before.providers);
        expect(read(p.credentials)).toBe(before.credentials);
        expect(read(p.userModels)).toBe(before.userModels);
        expect(read(p.picker)).toBe(before.picker);
        expect(existsSync(p.key)).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(readStatus(ctx).configured).toBe(false);
        expect(
            router.calls.some(
                (call) =>
                    call.args[2] === "credential" && call.args[4] === "remove",
            ),
        ).toBe(true);
    });

    it("re-running on is idempotent and keeps the pre-on backup", () => {
        seedState();
        const before = captureState();
        installFakeRouterCli();
        const router = makeRouter();

        configureCodex(ctx, SETTINGS, router.runner);
        configureCodex(
            ctx,
            { ...SETTINGS, apiKey: "sk_test_key_2" },
            router.runner,
        );

        expect(
            router.calls.filter((call) => call.args[2] === "add"),
        ).toHaveLength(1);
        const providers = readJson(paths().providers).providers as Record<
            string,
            unknown
        >[];
        expect(
            providers.filter((item) => item.id === PROVIDER_ID),
        ).toHaveLength(1);
        expect(read(paths().key)).toBe("sk_test_key_2\n");

        const outcome = disableCodex(ctx, router.runner);
        expect(outcome.outcome).toBe("restored");
        expect(read(paths().providers)).toBe(before.providers);
        expect(read(paths().credentials)).toBe(before.credentials);
        expect(read(paths().userModels)).toBe(before.userModels);
        expect(read(paths().picker)).toBe(before.picker);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("fails closed before writing anything when codex-router is unavailable", async () => {
        await expect(codex.on(ctx, {})).rejects.toThrow("Codex Router");
        expect(existsSync(join(home, ".codex"))).toBe(false);
        expect(existsSync(join(home, ".pollinations"))).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("fails closed when Codex itself is not installed", async () => {
        installFakeRouterCli();
        await expect(codex.on(ctx, {})).rejects.toThrow("Codex was not found");
        expect(existsSync(join(home, ".codex"))).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("rolls every file back from the snapshot when a step fails", () => {
        seedState();
        const before = captureState();
        installFakeRouterCli();
        const router = makeRouter({
            failOn: "curate-models",
            partialWriteOnFail: true,
        });

        expect(() => configureCodex(ctx, SETTINGS, router.runner)).toThrow(
            "simulated failure",
        );

        const p = paths();
        expect(read(p.providers)).toBe(before.providers);
        expect(read(p.credentials)).toBe(before.credentials);
        expect(read(p.userModels)).toBe(before.userModels);
        expect(read(p.picker)).toBe(before.picker);
        expect(existsSync(p.key)).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(readStatus(ctx).configured).toBe(false);
    });

    it("rejects a missing API key without touching state", () => {
        const router = makeRouter();
        expect(() =>
            configureCodex(ctx, { ...SETTINGS, apiKey: "   " }, router.runner),
        ).toThrow("No Pollinations API key");
        expect(router.calls).toEqual([]);
        expect(existsSync(join(home, ".codex"))).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("strips only its own entries when state changed since on", () => {
        seedState();
        installFakeRouterCli();
        const router = makeRouter();
        configureCodex(ctx, SETTINGS, router.runner);

        const p = paths();
        const providers = readJson(p.providers);
        (providers.providers as unknown[]).push({
            id: "newprovider",
            displayName: "New",
            baseUrl: "https://new.example/v1",
            adapter: "openai-chat",
            headers: {},
            enabled: true,
        });
        writeJson(p.providers, providers);

        const models = readJson(p.userModels);
        (models.models as unknown[]).push({
            provider: "newprovider",
            slug: "newprovider/x",
        });
        writeJson(p.userModels, models);

        const picker = readJson(p.picker);
        (picker.seeded as string[]).push("newprovider/x");
        writeJson(p.picker, picker);

        const outcome = disableCodex(ctx, router.runner);
        expect(outcome.outcome).toBe("stripped");

        const providerIds = (
            readJson(p.providers).providers as Record<string, unknown>[]
        ).map((item) => item.id);
        expect(providerIds).toEqual(["ollama-cloud", "newprovider"]);
        const modelEntries = readJson(p.userModels).models as Record<
            string,
            unknown
        >[];
        expect(modelEntries.map((item) => item.provider)).toEqual([
            "ollama-cloud",
            "newprovider",
        ]);
        expect(readJson(p.picker).seeded).toContain("newprovider/x");
        expect(readJson(p.picker).seeded).not.toContain(
            `${PROVIDER_ID}/deepseek/deepseek-v4-flash`,
        );
        expect(
            (
                readJson(p.credentials).credentials as Record<string, unknown>[]
            ).some((item) => item.providerId === PROVIDER_ID),
        ).toBe(false);
        expect(existsSync(p.key)).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        expect(readStatus(ctx).configured).toBe(false);
    });

    it("refuses to adopt a foreign provider using the same id", () => {
        const p = paths();
        writeJson(p.providers, {
            version: 1,
            providers: [
                {
                    id: PROVIDER_ID,
                    displayName: "Handmade",
                    baseUrl: "https://handmade.example/v1",
                    adapter: "openai-chat",
                    headers: {},
                    enabled: true,
                },
            ],
        });
        const before = read(p.providers);
        const router = makeRouter();

        expect(() => configureCodex(ctx, SETTINGS, router.runner)).toThrow(
            "does not own",
        );
        expect(read(p.providers)).toBe(before);
        expect(router.calls).toEqual([]);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("reports status safely without the router and without state", () => {
        const status = readStatus(ctx);
        expect(status).toMatchObject({ harness: "codex", configured: false });
        expect(status.files).toContain(paths().key);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("resolves the default state dir from CODEX_HOME and its overrides", () => {
        expect(stateDir(ctx)).toBe(join(home, ".codex", "codex-router"));

        const codexHome: HarnessContext = {
            home,
            env: { CODEX_HOME: "~/alt-codex" },
        };
        expect(stateDir(codexHome)).toBe(
            join(home, "alt-codex", "codex-router"),
        );

        const precedence: HarnessContext = {
            home,
            env: {
                KIMI_CODEX_STATE_DIR: "~/k",
                CODEX_ROUTER_STATE_DIR: "~/c",
                MODEL_ROUTER_STATE_DIR: "~/m",
            },
        };
        expect(stateDir(precedence)).toBe(join(home, "m"));

        const kimi: HarnessContext = {
            home,
            env: { KIMI_CODEX_STATE_DIR: "~/kimi" },
        };
        expect(stateDir(kimi)).toBe(join(home, "kimi"));
    });

    it("honors state dir and file overrides while wiring the router", () => {
        ctx = {
            home,
            env: {
                MODEL_ROUTER_STATE_DIR: "~/custom-state",
                MODEL_ROUTER_USER_MODELS: join(
                    home,
                    "elsewhere",
                    "models.json",
                ),
            },
        };
        const p = statePaths(ctx);
        expect(p.providers).toBe(
            join(home, "custom-state", "generic-providers.json"),
        );
        expect(p.userModels).toBe(join(home, "elsewhere", "models.json"));
        expect(p.picker).toBe(join(home, "custom-state", "model-picker.json"));

        installFakeRouterCli();
        const router = makeRouter();
        configureCodex(ctx, SETTINGS, router.runner);
        expect(existsSync(p.userModels)).toBe(true);
        expect(existsSync(p.providers)).toBe(true);
        expect(existsSync(join(home, ".codex", "codex-router"))).toBe(false);

        const outcome = disableCodex(ctx, router.runner);
        expect(outcome.outcome).toBe("restored");
        expect(existsSync(p.userModels)).toBe(false);
        expect(existsSync(p.providers)).toBe(false);
    });
});
