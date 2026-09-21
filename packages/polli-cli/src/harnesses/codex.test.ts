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
import {
    type CodexRouterRun,
    codex,
    codexFiles,
    configureCodex,
    credentialStored,
    disableCodex,
    routerStateDir,
} from "./codex.js";
import type { HarnessContext } from "./types.js";

const models = [
    { id: "openai/gpt-5.4-nano", contextWindow: 128000, input: ["text"] },
    {
        id: "openai/gpt-5.4-luna",
        contextWindow: 256000,
        input: ["text", "image"],
    },
];
const settings = {
    apiKey: "sk_polli_test",
    model: "openai/gpt-5.4-nano",
    models,
};

// Exactly the table `codex-router enable` writes into the user's config.toml,
// and the one `disable` removes again.
const MANAGED_BLOCK = '[model_providers.codex-router]\nname = "Codex Router"\n';

interface FakeProvider {
    id: string;
    enabled: boolean;
    baseUrl?: string;
    adapter?: string;
    credentialRef?: string;
}

let home: string;
let ctx: HarnessContext;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-harness-"));
    ctx = { home, env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const stateDir = () => routerStateDir(ctx);
const credentialFile = () =>
    join(stateDir(), "generic-provider-credentials", "pollinations.key");
const configFile = () => join(home, ".codex", "config.toml");
const markerFile = () => join(home, ".pollinations", "harnesses", "codex.json");
// polli's marker also lives in this directory, so match only the snapshot files
// (`<id>.<12 hex chars>.json`).
const snapshotFiles = () => {
    const dir = join(home, ".pollinations", "harnesses");
    return existsSync(dir)
        ? readdirSync(dir).filter((file) =>
              /^codex\.[0-9a-f]{12}\.json$/.test(file),
          )
        : [];
};
const read = (path: string) => readFileSync(path, "utf-8");

/** A Codex Router that answers the way the real one does, without spawning it. */
const makeRouter = (
    options: { failOn?: string; disableWrites?: string } = {},
) => {
    let provider: FakeProvider | null = null;
    let curated: string | null = null;
    let selected: string | null = null;
    const calls: string[][] = [];

    const configFileOrEmpty = () =>
        existsSync(configFile()) ? read(configFile()) : "";

    const runner = (args: string[]): CodexRouterRun => {
        calls.push(args);
        if (options.failOn && args.join(" ").startsWith(options.failOn)) {
            return { args, status: 1, stdout: "", stderr: "boom" };
        }
        const ok = (stdout = ""): CodexRouterRun => ({
            args,
            status: 0,
            stdout,
            stderr: "",
        });
        const no = (stderr = "no such provider"): CodexRouterRun => ({
            args,
            status: 1,
            stdout: "",
            stderr,
        });
        // A missing flag must read as undefined, not as the first argument.
        const flag = (name: string) => {
            const index = args.indexOf(name);
            return index === -1 ? undefined : args[index + 1];
        };
        const configured = () =>
            Boolean(provider?.credentialRef) && existsSync(credentialFile());

        if (args[0] === "providers" && args[1] === "generic") {
            const action = args[2];
            if (action === "show") {
                return provider ? ok(JSON.stringify({ provider })) : no();
            }
            if (action === "add") {
                provider = {
                    id: args[3],
                    enabled: true,
                    baseUrl: flag("--base-url"),
                    adapter: flag("--adapter"),
                };
                return ok();
            }
            if (action === "edit") {
                if (!provider) return no();
                const credentialRef = flag("--credential-ref");
                provider = {
                    ...provider,
                    baseUrl: flag("--base-url") ?? provider.baseUrl,
                    adapter: flag("--adapter") ?? provider.adapter,
                    ...(credentialRef ? { credentialRef } : {}),
                };
                return ok();
            }
            if (action === "enable") {
                if (provider) provider.enabled = true;
                return ok();
            }
            if (action === "remove") {
                provider = null;
                rmSync(credentialFile(), { force: true });
                return ok();
            }
            if (action === "credential") {
                // `status` reports rather than fails, so the answer only exists
                // in the payload — same as the real command.
                return args.includes("--json")
                    ? ok(JSON.stringify({ configured: configured() }))
                    : configured()
                      ? ok("configured")
                      : no("not configured");
            }
        }
        if (args[0] === "curate-models") {
            curated = flag("--models") ?? null;
            return ok();
        }
        if (args[0] === "control" && args[1] === "model-set") {
            selected = args[2];
            return ok();
        }
        if (args[0] === "enable") {
            mkdirSync(join(home, ".codex"), { recursive: true });
            const text = configFileOrEmpty();
            if (!text.includes("[model_providers.codex-router]")) {
                writeFileSync(
                    configFile(),
                    `${text.replace(/\n*$/, "\n")}${MANAGED_BLOCK}`,
                );
            }
            return ok();
        }
        if (args[0] === "disable") {
            const text = configFileOrEmpty();
            if (!text.includes("[model_providers.codex-router]")) return ok();
            // The real command rewrites the file from its own recorded state,
            // which need not reproduce the user's bytes exactly.
            writeFileSync(
                configFile(),
                options.disableWrites ?? text.replace(MANAGED_BLOCK, ""),
            );
            return ok();
        }
        return no(`unexpected command ${args.join(" ")}`);
    };
    return {
        runner,
        calls,
        provider: () => provider,
        curated: () => curated,
        selected: () => selected,
        commands: () => calls.map((args) => args.join(" ")),
        adds: () =>
            calls.filter((args) => args[0] === "providers" && args[2] === "add")
                .length,
        edits: () =>
            calls.filter(
                (args) => args[0] === "providers" && args[2] === "edit",
            ).length,
    };
};

const writeCredential = (target: HarnessContext, apiKey: string) => {
    mkdirSync(join(routerStateDir(target), "generic-provider-credentials"), {
        recursive: true,
    });
    writeFileSync(credentialFile(), `${apiKey}\n`, { mode: 0o600 });
    return { credentialRef: "cred_rTEST" };
};

describe("codex harness", () => {
    it("points Codex at Pollinations through the router's own commands", () => {
        const router = makeRouter();
        const result = configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });

        expect(result).toMatchObject({
            harness: "codex",
            label: "Codex",
            configured: true,
            model: "openai/gpt-5.4-nano",
        });
        expect(router.provider()).toMatchObject({
            baseUrl: "https://gen.pollinations.ai/v1",
            adapter: "openai-chat",
            enabled: true,
            credentialRef: "cred_rTEST",
        });
        expect(router.curated()).toBe(
            "openai/gpt-5.4-nano,openai/gpt-5.4-luna",
        );
        // The router publishes generic models as `<provider>/<upstream id>`.
        expect(router.selected()).toBe("pollinations/openai/gpt-5.4-nano");
        expect(router.commands()).toContain("enable");
        expect(read(credentialFile())).toBe("sk_polli_test\n");
        expect(statSync(credentialFile()).mode & 0o777).toBe(0o600);
        expect(statSync(markerFile()).mode & 0o777).toBe(0o600);
        expect(JSON.parse(read(markerFile()))).toMatchObject({
            model: "openai/gpt-5.4-nano",
            credentialRef: "cred_rTEST",
            clientBlockAdded: true,
        });
        expect(read(configFile())).toContain("[model_providers.codex-router]");
        // Only the client document and polli's marker are restorable; the
        // router's own provider and credential state never enters the snapshot.
        expect(codexFiles(ctx)).toEqual([configFile(), markerFile()]);
        expect(snapshotFiles()).toHaveLength(1);
    });

    it("falls back to the router's documented key file when its modules moved", () => {
        const router = makeRouter();
        const result = configureCodex(ctx, settings, {
            runner: router.runner,
            // A router revision whose credential modules moved: the module-based
            // writer cannot find them and reports no reference.
            writeCredential: () => ({ credentialRef: null }),
        });

        expect(result.configured).toBe(true);
        expect(read(credentialFile())).toBe("sk_polli_test\n");
        expect(statSync(credentialFile()).mode & 0o777).toBe(0o600);
        const store = JSON.parse(
            read(join(stateDir(), "provider-credentials.json")),
        ) as {
            schemaVersion: number;
            credentials: {
                id: string;
                secretRef: Record<string, string>;
                [key: string]: unknown;
            }[];
        };
        expect(store.schemaVersion).toBe(2);
        expect(store.credentials).toHaveLength(1);
        const [entry] = store.credentials;
        expect(entry).toMatchObject({
            providerId: "pollinations",
            providerType: "generic",
            kind: "api_key",
            state: "active",
            secretRef: {
                type: "provider-file",
                providerId: "pollinations",
                target: "codex",
            },
        });
        // Exactly the fields the router's own command writes: the key file path
        // is derived from the provider id, never carried in the reference.
        expect(Object.keys(entry.secretRef).sort()).toEqual([
            "providerId",
            "target",
            "type",
        ]);
        expect(entry.id).toMatch(/^cred_[A-Za-z0-9_-]{16,64}$/);
        expect(router.provider()).toMatchObject({ credentialRef: entry.id });
        expect(router.commands()).toContain(
            `providers generic edit pollinations --credential-ref ${entry.id}`,
        );
    });

    it("reads the credential answer from the router's own status payload", () => {
        const calls: string[][] = [];
        const answer = (stdout: string) => {
            return (args: string[]): CodexRouterRun => {
                calls.push(args);
                return { args, status: 0, stdout, stderr: "" };
            };
        };

        expect(credentialStored(answer('{"configured": true}'))).toBe(true);
        expect(credentialStored(answer('{"configured": false}'))).toBe(false);
        // A revision without --json still answers in prose.
        expect(
            credentialStored(
                answer("pollinations credential is configured.\n"),
            ),
        ).toBe(true);
        expect(
            credentialStored(
                answer("pollinations credential is not configured.\n"),
            ),
        ).toBe(false);
        expect(calls[0]).toEqual([
            "providers",
            "generic",
            "credential",
            "pollinations",
            "status",
            "--json",
        ]);
    });

    it("keeps an existing key and provider instead of writing them again", () => {
        const router = makeRouter();
        let writes = 0;
        const write = (target: HarnessContext, apiKey: string) => {
            writes += 1;
            return writeCredential(target, apiKey);
        };

        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential: write,
        });
        const adds = router.adds();
        const edits = router.edits();
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential: write,
        });

        expect(writes).toBe(1);
        // The provider descriptor and its credential already match, so the
        // second run adds nothing and edits nothing.
        expect(router.adds()).toBe(adds);
        expect(router.edits()).toBe(edits);
        expect(adds).toBe(1);
    });

    it("restores the previous config byte-for-byte when nothing else changed", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        const original = '# my codex config\nmodel = "gpt-5.4"\n';
        writeFileSync(configFile(), original);
        const router = makeRouter();
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });

        const result = disableCodex(ctx, { runner: router.runner });

        expect(result.outcome).toBe("restored");
        expect(read(configFile())).toBe(original);
        expect(existsSync(markerFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        // The provider and its protected key are withdrawn either way.
        expect(router.provider()).toBe(null);
        expect(existsSync(credentialFile())).toBe(false);
    });

    it("keeps the user's exact bytes even when the router rewrites the file", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        const original = '# my codex config\nmodel="gpt-5.4"\n';
        writeFileSync(configFile(), original);
        // `codex-router disable` rewrites config.toml from its own recorded
        // state; whatever it normalises, an untouched file comes back as it was.
        const router = makeRouter({
            disableWrites: '# my codex config\nmodel = "gpt-5.4"\n',
        });
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });

        const result = disableCodex(ctx, { runner: router.runner });

        expect(result.outcome).toBe("restored");
        expect(router.commands()).toContain("disable");
        expect(read(configFile())).toBe(original);
    });

    it("strips only its own entries when the user edited the config afterwards", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(configFile(), "# my codex config\n");
        const router = makeRouter();
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });
        writeFileSync(configFile(), `${read(configFile())}# edited later\n`);

        const result = disableCodex(ctx, { runner: router.runner });

        expect(result.outcome).toBe("stripped");
        expect(router.commands()).toContain("disable");
        const text = read(configFile());
        expect(text).toContain("# edited later");
        expect(text).toContain("# my codex config");
        expect(text).not.toContain("[model_providers.codex-router]");
        expect(existsSync(credentialFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("keeps the client wiring it did not add", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(configFile(), MANAGED_BLOCK);
        const router = makeRouter();
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });
        writeFileSync(configFile(), `${read(configFile())}# edited later\n`);

        const result = disableCodex(ctx, { runner: router.runner });

        expect(result.outcome).toBe("stripped");
        expect(router.commands()).not.toContain("disable");
        expect(read(configFile())).toContain("[model_providers.codex-router]");
    });

    it("keeps the wiring claim it made in an earlier run", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        writeFileSync(configFile(), "# my codex config\n");
        const router = makeRouter();
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });
        // A second `on` (another model, another run) no longer adds the block
        // itself, but polli is still the integration that added it, so `off`
        // has to be allowed to withdraw it.
        configureCodex(ctx, settings, {
            runner: router.runner,
            writeCredential,
        });
        expect(read(configFile())).toContain("[model_providers.codex-router]");
        writeFileSync(configFile(), `${read(configFile())}# edited later\n`);

        const result = disableCodex(ctx, { runner: router.runner });

        expect(result.outcome).toBe("stripped");
        expect(router.commands()).toContain("disable");
        expect(read(configFile())).toContain("# edited later");
        expect(read(configFile())).not.toContain(
            "[model_providers.codex-router]",
        );
    });

    it("rolls the client's config back when a later router step fails", () => {
        mkdirSync(join(home, ".codex"), { recursive: true });
        const original = '# my codex config\nmodel = "gpt-5.4"\n';
        writeFileSync(configFile(), original);
        // The router's `enable` already rewrote config.toml by the time this
        // step fails, so the snapshot has to put it back.
        const router = makeRouter({ failOn: "control model-set" });

        expect(() =>
            configureCodex(ctx, settings, {
                runner: router.runner,
                writeCredential,
            }),
        ).toThrow(/failed/);

        expect(read(configFile())).toBe(original);
        expect(existsSync(markerFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
        // The provider this run created — with the key file behind it — is
        // withdrawn again rather than left pointing at nothing.
        expect(router.provider()).toBe(null);
        expect(existsSync(credentialFile())).toBe(false);
    });

    it("leaves a provider it did not create alone when a step fails", () => {
        // A provider that was already registered (another polli run, or the
        // user) survives a failed `on`: only the run that created it withdraws it.
        const router = makeRouter({ failOn: "control model-set" });
        router.runner([
            "providers",
            "generic",
            "add",
            "pollinations",
            "--name",
            "Pollinations.ai",
            "--base-url",
            "https://gen.pollinations.ai/v1",
            "--adapter",
            "openai-chat",
        ]);

        expect(() =>
            configureCodex(ctx, settings, {
                runner: router.runner,
                writeCredential,
            }),
        ).toThrow(/failed/);

        expect(router.provider()).toMatchObject({ id: "pollinations" });
    });

    it("reports not configured when the router has no Pollinations provider", () => {
        const router = makeRouter();
        const result = disableCodex(ctx, { runner: router.runner });
        expect(result).toMatchObject({
            configured: false,
            outcome: "unchanged",
        });
        expect(router.commands()).not.toContain("enable");
    });

    it("refuses to touch anything before Codex Router is installed", async () => {
        await expect(codex.on(ctx, {})).rejects.toThrow(
            /Codex Router is required/,
        );
        expect(existsSync(markerFile())).toBe(false);
        expect(snapshotFiles()).toHaveLength(0);
    });

    it("honors CODEX_HOME and treats a blank one as unset", () => {
        const custom = join(home, "custom-codex");
        expect(routerStateDir({ home, env: { CODEX_HOME: custom } })).toBe(
            join(custom, "codex-router"),
        );
        expect(routerStateDir({ home, env: { CODEX_HOME: "  " } })).toBe(
            join(home, ".codex", "codex-router"),
        );
        // The state directory has its own override, which wins.
        expect(
            routerStateDir({
                home,
                env: { MODEL_ROUTER_STATE_DIR: "~/router-state" },
            }),
        ).toBe(join(home, "router-state"));
    });
});
