import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    captureFiles,
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    restoreCapturedFiles,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex";
const PROVIDER = "pollinations";
const DISPLAY_NAME = "Pollinations.ai";
const PROVIDER_ADAPTER = "openai-chat";
const PROVIDER_DESCRIPTION =
    "Pollinations.ai, configured by polli harness codex";
// The router publishes generic models as `<provider>/<upstream id>` (see
// `userModelIdentity` in its `src/user-models.mjs`), so the slug Codex receives
// is `pollinations/<model id>`.
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
// `codex-router enable` writes this table into the user's config.toml, and
// `codex-router disable` removes it again. polli only ever looks for it.
const MANAGED_BLOCK = "[model_providers.codex-router]";
// The router's generic-provider credential references name one plane; a
// reference written against any other target is refused by
// `normalizeSecretRef` in its `src/provider-credential-store.mjs`.
const ROUTER_PLANE_TARGET = "codex";
const INSTALL_HINT =
    "Codex Router is required. Install it from https://github.com/duolahypercho/codex-router" +
    " (install.sh, the Homebrew tap, or the PowerShell installer), run `codex-router setup --guided`," +
    " then run this command again.";
const CREDENTIAL_HINT =
    "Pollinations could not store the key in Codex Router's protected credential file." +
    " Run `codex-router providers generic credential pollinations set` and paste the key printed by" +
    " `polli keys create` (or a key from enter.pollinations.ai/keys), then run this command again.";

/**
 * Codex Router keeps one state directory per installation, shared by every
 * client integration it supports, and reads its own overrides from the
 * environment. Mirror that resolution exactly or a user who moved their Codex
 * home gets a provider nothing reads.
 */
export const codexHome = (ctx: HarnessContext) => {
    const configured = ctx.env.CODEX_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : join(ctx.home, ".codex");
};

export const routerStateDir = (ctx: HarnessContext) => {
    const configured =
        ctx.env.MODEL_ROUTER_STATE_DIR?.trim() ||
        ctx.env.CODEX_ROUTER_STATE_DIR?.trim() ||
        ctx.env.KIMI_CODEX_STATE_DIR?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : join(codexHome(ctx), "codex-router");
};

const override = (ctx: HarnessContext, name: string, fallback: string) => {
    const configured = ctx.env[name]?.trim();
    return configured ? resolveHomePath(ctx.home, configured) : fallback;
};

const credentialStorePath = (ctx: HarnessContext) =>
    override(
        ctx,
        "MODEL_ROUTER_PROVIDER_CREDENTIAL_STORE",
        join(routerStateDir(ctx), "provider-credentials.json"),
    );
const credentialPath = (ctx: HarnessContext) =>
    join(
        routerStateDir(ctx),
        "generic-provider-credentials",
        `${PROVIDER}.key`,
    );
const configPath = (ctx: HarnessContext) => join(codexHome(ctx), "config.toml");
// polli's own record: which model we selected, and whether we were the run that
// added the managed config.toml block (so `off` never removes someone else's).
const markerPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", `${ID}.json`);

/**
 * What `off` may restore: Codex's own config.toml, which the router's `enable`
 * patches and its `disable` un-patches, and polli's marker. The router's
 * provider and credential documents stay out of the snapshot on purpose — they
 * are the router's private state, only ever changed through its own commands
 * and withdrawn by its own `providers generic remove`, and a command that
 * rewrote them between `on` and `off` would otherwise look like user drift and
 * turn every clean `off` into a partial strip.
 */
export const codexFiles = (ctx: HarnessContext) => [
    configPath(ctx),
    markerPath(ctx),
];

/** One `codex-router` invocation. Injected by the tests. */
export interface CodexRouterRun {
    args: string[];
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}

export type CodexRouterRunner = (
    args: string[],
    input?: string,
) => CodexRouterRun;

export interface CodexMarker {
    model: string;
    providerId: string;
    credentialRef: string | null;
    /** True when this run added the managed block to the user's config.toml. */
    clientBlockAdded: boolean;
}

export interface CodexProviderState {
    id?: string;
    enabled?: boolean;
    baseUrl?: string;
    adapter?: string;
    credentialRef?: string;
}

export interface CodexDependencies {
    runner?: CodexRouterRunner;
    /**
     * Writes the dedicated key into Codex Router's protected credential file and
     * returns the credential reference that binds it to the provider. Injected
     * so the tests never spawn the router.
     */
    writeCredential?: (
        ctx: HarnessContext,
        apiKey: string,
        runner: CodexRouterRunner,
    ) => { credentialRef: string | null };
}

const spawnCodexRouter: CodexRouterRunner = (args, input) => {
    const result = spawnSync("codex-router", args, {
        encoding: "utf-8",
        input,
    });
    return {
        args,
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: result.error,
    };
};

/** Where the `codex-router` launcher actually lives, for module-root lookups. */
const routerBinCandidates = (ctx: HarnessContext) => {
    const onPath = (ctx.env.PATH ?? ctx.env.Path ?? "")
        .split(delimiter)
        .filter(Boolean)
        .flatMap((dir) =>
            process.platform === "win32"
                ? [join(dir, "codex-router.cmd"), join(dir, "codex-router")]
                : [join(dir, "codex-router")],
        );
    return [
        ...onPath,
        join(ctx.home, ".local", "bin", "codex-router"),
        "/opt/homebrew/bin/codex-router",
        "/usr/local/bin/codex-router",
    ];
};

export const codexRouterPath = (ctx: HarnessContext) =>
    routerBinCandidates(ctx).find((candidate) => existsSync(candidate)) ?? null;

export const routerAvailable = (ctx: HarnessContext) =>
    commandExists("codex-router", ctx.env, [
        join(ctx.home, ".local", "bin", "codex-router"),
        "/opt/homebrew/bin/codex-router",
        "/usr/local/bin/codex-router",
    ]);

const requireRouter = (ctx: HarnessContext) => {
    if (!routerAvailable(ctx)) throw new Error(INSTALL_HINT);
};

const runRouter = (
    runner: CodexRouterRunner,
    args: string[],
    input?: string,
) => {
    const result = runner(args, input);
    if (result.error) {
        throw new Error(
            `Could not run \`codex-router ${args.join(" ")}\`: ${result.error.message}`,
        );
    }
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout).trim();
        throw new Error(
            `\`codex-router ${args.join(" ")}\` failed: ${detail || `exit code ${result.status}`}`,
        );
    }
    return result;
};

const providerState = (
    runner: CodexRouterRunner,
): CodexProviderState | null => {
    const result = runner(["providers", "generic", "show", PROVIDER, "--json"]);
    if (result.error || result.status !== 0) return null;
    try {
        const parsed = JSON.parse(result.stdout) as {
            provider?: CodexProviderState;
        };
        return parsed.provider ?? null;
    } catch {
        return null;
    }
};

/**
 * `providers generic credential ... status` always exits 0 — it reports, it does
 * not fail — so the answer has to come from its `--json` payload, which carries
 * the same `configured` answer (`enabled` provider, active reference, and a
 * readable key file) the catalog uses.
 */
export const credentialStored = (runner: CodexRouterRunner) => {
    const result = runner([
        "providers",
        "generic",
        "credential",
        PROVIDER,
        "status",
        "--json",
    ]);
    if (result.error || result.status !== 0) return false;
    try {
        return (
            (JSON.parse(result.stdout) as { configured?: boolean })
                .configured === true
        );
    } catch {
        // A revision without `--json` prints `pollinations credential is
        // configured.`; match that phrase and only that one, so the negative
        // sentence ("is not configured") never counts as success.
        return /\bis configured\b/i.test(result.stdout);
    }
};

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(credentialPath(ctx));
    return text?.trim() || null;
};

const readMarker = (ctx: HarnessContext): CodexMarker | null => {
    const text = readTextIfExists(markerPath(ctx));
    if (!text) return null;
    try {
        return JSON.parse(text) as CodexMarker;
    } catch {
        return null;
    }
};

const writeMarker = (ctx: HarnessContext, marker: CodexMarker) =>
    writeTextAtomic(
        markerPath(ctx),
        `${JSON.stringify(marker, null, 2)}\n`,
        0o600,
    );

export const clientBlockPresent = (ctx: HarnessContext) =>
    (readTextIfExists(configPath(ctx)) ?? "").includes(MANAGED_BLOCK);

/**
 * Write the dedicated key through the router's own credential code, run with
 * the secret on stdin. The router's `credential set` command reads a hidden
 * terminal prompt that a harness cannot answer, and re-implementing its
 * credential-store format here would break whenever that format moves.
 */
const ROUTER_CREDENTIAL_WRITER = [
    'import { pathToFileURL } from "node:url";',
    "const root = process.env.POLLI_ROUTER_ROOT;",
    "const providerId = process.env.POLLI_ROUTER_PROVIDER;",
    "const chunks = [];",
    "for await (const chunk of process.stdin) chunks.push(chunk);",
    'const key = Buffer.concat(chunks).toString("utf8").trim();',
    'if (!key) { console.error("no key on stdin"); process.exit(2); }',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: these must interpolate.
    "const credentials = await import(pathToFileURL(`${root}/src/provider-credentials.mjs`).href);",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: as above.
    "const store = await import(pathToFileURL(`${root}/src/provider-credential-store.mjs`).href);",
    "const reference = store.readProviderCredentialStore().credentials.find(",
    '    (entry) => entry.providerType === "generic" && entry.providerId === providerId && entry.state === "active",',
    ");",
    "const reusable = reference && credentials.resolveGenericProviderCredentialReference(providerId, reference.secretRef)?.value;",
    "const credential = reusable ? reference : store.addGenericProviderCredentialReference({ providerId });",
    "credentials.writeGenericProviderCredential(providerId, key);",
    "process.stdout.write(credential.id);",
].join("\n");

const writeCredentialThroughRouter = (
    ctx: HarnessContext,
    apiKey: string,
): { credentialRef: string | null } => {
    const bin = codexRouterPath(ctx);
    if (!bin) return { credentialRef: null };
    let root: string;
    try {
        root = dirname(dirname(realpathSync(bin)));
    } catch {
        return { credentialRef: null };
    }
    if (!existsSync(join(root, "src", "provider-credentials.mjs"))) {
        return { credentialRef: null };
    }
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", ROUTER_CREDENTIAL_WRITER],
        {
            encoding: "utf-8",
            input: `${apiKey}\n`,
            env: {
                ...ctx.env,
                POLLI_ROUTER_ROOT: root,
                POLLI_ROUTER_PROVIDER: PROVIDER,
            },
        },
    );
    if (result.status !== 0) return { credentialRef: null };
    const credentialRef = result.stdout.trim();
    return credentialRef ? { credentialRef } : { credentialRef: null };
};

interface CredentialReference {
    id: string;
    providerId: string;
    providerType: string;
    kind: string;
    label: string;
    state: string;
    secretRef: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

/**
 * Fallback writer for a router revision that moved its credential modules: the
 * protected key file and the opaque reference are the same pair the router's
 * own command writes, and `on` verifies the result with the router's own
 * `credential status` before it reports success.
 */
const writeCredentialFiles = (
    ctx: HarnessContext,
    apiKey: string,
    runner: CodexRouterRunner,
): { credentialRef: string | null } => {
    writeTextAtomic(credentialPath(ctx), `${apiKey}\n`, 0o600);
    const existingText = readTextIfExists(credentialStorePath(ctx));
    let store: { schemaVersion: number; credentials: CredentialReference[] };
    try {
        const parsed = JSON.parse(existingText ?? "") as {
            schemaVersion?: unknown;
            credentials?: unknown;
        };
        if (
            typeof parsed.schemaVersion !== "number" ||
            !Array.isArray(parsed.credentials)
        ) {
            throw new Error("unexpected credential store");
        }
        store = {
            schemaVersion: parsed.schemaVersion,
            credentials: parsed.credentials as CredentialReference[],
        };
    } catch {
        store = { schemaVersion: 2, credentials: [] };
    }
    const timestamp = new Date().toISOString();
    const reused = store.credentials.find(
        (entry) =>
            entry.providerType === "generic" && entry.providerId === PROVIDER,
    );
    const credentialRef =
        reused?.id ?? `cred_r${randomBytes(18).toString("base64url")}`;
    const reference: CredentialReference = {
        id: credentialRef,
        providerId: PROVIDER,
        providerType: "generic",
        kind: "api_key",
        label: DISPLAY_NAME,
        state: "active",
        // Exactly the reference the router writes for a generic provider: the
        // key file path is derived from the provider id, never carried here.
        secretRef: {
            type: "provider-file",
            providerId: PROVIDER,
            target: ROUTER_PLANE_TARGET,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const credentials = store.credentials.filter(
        (entry) => entry.id !== credentialRef,
    );
    credentials.push(reference);
    writeTextAtomic(
        credentialStorePath(ctx),
        `${JSON.stringify({ schemaVersion: store.schemaVersion, credentials }, null, 2)}\n`,
        0o600,
    );
    runRouter(runner, [
        "providers",
        "generic",
        "edit",
        PROVIDER,
        "--credential-ref",
        credentialRef,
    ]);
    return { credentialRef };
};

/** Returns true when this run is the one that created the provider. */
const ensureProvider = (runner: CodexRouterRunner) => {
    const provider = providerState(runner);
    if (!provider) {
        runRouter(runner, [
            "providers",
            "generic",
            "add",
            PROVIDER,
            "--name",
            DISPLAY_NAME,
            "--base-url",
            `${BASE_URL}/v1`,
            "--adapter",
            PROVIDER_ADAPTER,
            "--description",
            PROVIDER_DESCRIPTION,
        ]);
        return true;
    }
    if (
        provider.baseUrl !== `${BASE_URL}/v1` ||
        provider.adapter !== PROVIDER_ADAPTER
    ) {
        runRouter(runner, [
            "providers",
            "generic",
            "edit",
            PROVIDER,
            "--base-url",
            `${BASE_URL}/v1`,
            "--adapter",
            PROVIDER_ADAPTER,
        ]);
    }
    if (provider.enabled === false) {
        runRouter(runner, ["providers", "generic", "enable", PROVIDER]);
    }
    return false;
};

const bindCredential = (
    ctx: HarnessContext,
    apiKey: string,
    runner: CodexRouterRunner,
    dependencies: CodexDependencies,
) => {
    if (credentialStored(runner)) {
        return providerState(runner)?.credentialRef ?? null;
    }
    const write = dependencies.writeCredential ?? writeCredentialThroughRouter;
    const written = write(ctx, apiKey, runner) as {
        credentialRef: string | null;
    };
    if (!written.credentialRef) {
        // The router modules moved, or the write found no protected store.
        const fallback = writeCredentialFiles(ctx, apiKey, runner);
        if (!fallback.credentialRef) throw new Error(CREDENTIAL_HINT);
        if (!credentialStored(runner)) throw new Error(CREDENTIAL_HINT);
        return fallback.credentialRef;
    }
    runRouter(runner, [
        "providers",
        "generic",
        "edit",
        PROVIDER,
        "--credential-ref",
        written.credentialRef,
    ]);
    if (!credentialStored(runner)) throw new Error(CREDENTIAL_HINT);
    return written.credentialRef;
};

const curateModels = (models: HarnessModel[], runner: CodexRouterRunner) => {
    runRouter(runner, [
        "curate-models",
        PROVIDER,
        "--models",
        models.map((model) => model.id).join(","),
        "--apply",
    ]);
};

const selectModel = (model: string, runner: CodexRouterRunner) => {
    runRouter(runner, ["control", "model-set", `${PROVIDER}/${model}`]);
};

export interface CodexSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

/**
 * Point Codex at Pollinations. Everything the router owns is changed through
 * the router's own commands; the only files polli touches directly are its
 * marker and, when the router cannot be asked, the router's documented
 * protected key file. The snapshot covers the client document `enable` patches,
 * so a failure here puts the user's config.toml back byte-for-byte.
 */
export const configureCodex = (
    ctx: HarnessContext,
    settings: CodexSettings,
    dependencies: CodexDependencies = {},
): HarnessResult => {
    const runner = dependencies.runner ?? spawnCodexRouter;
    const addedClientBlock = !clientBlockPresent(ctx);
    // An earlier run of ours may already have added the wiring. Once this
    // adapter has claimed it, the claim has to survive a re-run: `off` reads the
    // marker to decide whether it may run the router's own `disable`, and a
    // second `on` that dropped the claim would leave the managed block behind
    // when the user edited config.toml after that second run.
    const claimedClientBlock =
        addedClientBlock || readMarker(ctx)?.clientBlockAdded === true;
    let addedProvider = false;
    applyWithSnapshot(ctx, ID, codexFiles(ctx), () => {
        try {
            addedProvider = ensureProvider(runner);
            const credentialRef = bindCredential(
                ctx,
                settings.apiKey,
                runner,
                dependencies,
            );
            curateModels(settings.models, runner);
            // `enable` is the router's own transactional entrypoint: it
            // publishes the routed catalog, re-applies the Codex wiring, and
            // rolls itself back if any step fails. Running it keeps polli out of
            // the business of hand-editing Codex's config.toml.
            runRouter(runner, ["enable"]);
            selectModel(settings.model, runner);
            writeMarker(ctx, {
                model: settings.model,
                providerId: PROVIDER,
                credentialRef,
                clientBlockAdded: claimedClientBlock,
            });
        } catch (error) {
            // A failed run must not leave a provider polli created behind. A
            // provider that was already there is left alone: another run may
            // own it, and only `off` removes what it finds.
            if (addedProvider) {
                try {
                    runRouter(runner, [
                        "providers",
                        "generic",
                        "remove",
                        PROVIDER,
                    ]);
                } catch {}
            }
            throw error;
        }
    });
    return codexStatus(ctx, dependencies);
};

/**
 * Undo only what this adapter did: the provider with its key, curated routes,
 * and picker decisions (`providers generic remove`), the client wiring `enable`
 * added (`disable`, the router's own inverse of it, and only when this adapter
 * was the run that added it), and polli's marker.
 */
export const disableCodex = (
    ctx: HarnessContext,
    dependencies: CodexDependencies = {},
): HarnessResult => {
    const runner = dependencies.runner ?? spawnCodexRouter;
    const files = codexFiles(ctx);
    const addedClientBlock = readMarker(ctx)?.clientBlockAdded === true;
    // The snapshot decision has to come first: whether the user's config.toml
    // can be restored byte-for-byte is only decidable before the router's own
    // commands rewrite it.
    const provider = providerState(runner);
    const outcome = restoreOrStrip(
        ctx,
        ID,
        files,
        () => addedClientBlock || Boolean(provider),
    );
    // Read after the restore, so these are the user's own pre-`on` bytes.
    const restored = outcome === "restored" ? captureFiles(files) : null;

    if (addedClientBlock) runRouter(runner, ["disable"]);
    if (provider) {
        runRouter(runner, ["providers", "generic", "remove", PROVIDER]);
    }
    // `disable` rewrites config.toml from the router's own recorded state, which
    // can differ from the user's file by something as small as whitespace. When
    // the snapshot says the file was never touched, the user's bytes win.
    if (restored) restoreCapturedFiles(restored);

    removeIfExists(markerPath(ctx));
    return { ...codexStatus(ctx, dependencies), configured: false, outcome };
};

export const codexStatus = (
    ctx: HarnessContext,
    dependencies: CodexDependencies = {},
): HarnessResult => {
    const runner = dependencies.runner ?? spawnCodexRouter;
    const marker = readMarker(ctx);
    const provider = providerState(runner);
    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(
            provider &&
                provider.enabled !== false &&
                credentialStored(runner) &&
                clientBlockPresent(ctx),
        ),
        model: marker?.model,
        files: codexFiles(ctx),
    };
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Codex as a Pollinations client through Codex Router",
    restartHint:
        "Fully quit and reopen Codex, then choose a pollinations model in the model picker.",

    async on(ctx, options) {
        requireRouter(ctx);
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureCodex(ctx, { apiKey, model, models });
    },

    off: disableCodex,
    status: codexStatus,
};
