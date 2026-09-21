import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { printInfo, printWarn } from "../lib/output.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { smokeChat } from "./smoke.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex (Codex Router)";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const PROVIDER_ID = "pollinations";
// Codex Router's credential store validates ids against
// ^cred_[A-Za-z0-9_-]{16,64}$ (src/provider-credential-store.mjs) and silently
// drops the whole store when an entry fails — so the id must satisfy that
// regex, not merely look reasonable (`cred_pollinations` is 12 chars and was
// rejected: every upstream request then failed with an auth error).
const CREDENTIAL_ID = "cred_pollinations_harness";
/** Ids written by older polli-cli builds that the router's store rejects. */
export const LEGACY_CREDENTIAL_IDS = ["cred_pollinations"];
const BASE_URL = "https://gen.pollinations.ai/v1";
const PROVIDER_LABEL = "Pollinations API key";
/** Managed blocks `config-manager.mjs` writes around everything it owns. */
const MANAGED_MARKER = /^# BEGIN (?:kimi-)?codex-(?:router|proxy)-/m;

// ---------------------------------------------------------------------------
// Router paths (the stable checkout Codex Router's own AGENTS.md prescribes)
// ---------------------------------------------------------------------------

export const routerHome = (ctx: HarnessContext): string => {
    const override = ctx.env.CODEX_ROUTER_HOME?.trim();
    if (override) return override;
    if (process.platform === "win32") {
        return join(
            ctx.env.LOCALAPPDATA ?? join(ctx.home, "AppData", "Local"),
            "codex-router",
        );
    }
    return join(ctx.home, ".local", "share", "codex-router");
};

export const routerControlEntry = (ctx: HarnessContext): string | null => {
    const home = routerHome(ctx);
    return (
        ["src/control.mjs", "lib/control.mjs"]
            .map((rel) => join(home, rel))
            .find((path) => existsSync(path)) ?? null
    );
};

export const codexHomeDir = (ctx: HarnessContext): string =>
    ctx.env.CODEX_HOME?.trim() || join(ctx.home, ".codex");

/** Codex Router's state dir: `$CODEX_HOME/codex-router` (src/paths.mjs). */
export const routerStateDir = (ctx: HarnessContext): string =>
    join(codexHomeDir(ctx), "codex-router");

export const configTomlPath = (ctx: HarnessContext): string =>
    join(codexHomeDir(ctx), "config.toml");

export const stateFilePaths = (ctx: HarnessContext) => ({
    genericProviders: join(routerStateDir(ctx), "generic-providers.json"),
    credentialStore: join(routerStateDir(ctx), "provider-credentials.json"),
    userModels: join(routerStateDir(ctx), "user-models.json"),
    apiKey: join(
        routerStateDir(ctx),
        "generic-provider-credentials",
        `${PROVIDER_ID}.key`,
    ),
});

/** Every file `on` writes; `off` restores or strips exactly these. */
const files = (ctx: HarnessContext) => {
    const paths = stateFilePaths(ctx);
    return [
        paths.genericProviders,
        paths.credentialStore,
        paths.userModels,
        paths.apiKey,
    ];
};

// ---------------------------------------------------------------------------
// Pure cores (unit-tested) — the state documents Codex Router owns
// ---------------------------------------------------------------------------

export const isRouterWired = (configToml: string | null): boolean =>
    configToml !== null && MANAGED_MARKER.test(configToml);

export const buildGenericProvider = (credentialRef: string) => ({
    id: PROVIDER_ID,
    displayName: "Pollinations",
    description: "Pollinations models via gen.pollinations.ai (polli harness)",
    baseUrl: BASE_URL,
    adapter: "openai-chat",
    headers: {},
    credentialRef,
    allowPrivate: false,
    enabled: true,
});

interface GenericProviderDoc {
    version: number;
    providers: Array<Record<string, unknown>>;
}

export const upsertGenericProvider = (
    doc: GenericProviderDoc | null,
    provider: Record<string, unknown>,
): { doc: GenericProviderDoc; changed: boolean } => {
    const current: GenericProviderDoc = doc ?? { version: 1, providers: [] };
    const providers = [...current.providers];
    const index = providers.findIndex(
        (entry) => (entry as { id?: string }).id === PROVIDER_ID,
    );
    if (index === -1) {
        providers.push(provider);
        return { doc: { version: 1, providers }, changed: true };
    }
    const existing = providers[index] as Record<string, unknown>;
    const merged = {
        ...provider,
        // Fields the user may have tuned stay theirs. The credentialRef is
        // ours and stable, so the patch wins for it.
        ...(typeof existing.description === "string"
            ? { description: existing.description }
            : {}),
    };
    if (JSON.stringify(existing) === JSON.stringify(merged)) {
        return { doc: current, changed: false };
    }
    providers[index] = merged;
    return { doc: { version: 1, providers }, changed: true };
};

export const buildCredentialEntry = (
    secretRefTarget: string,
    now: string,
): Record<string, unknown> => ({
    id: CREDENTIAL_ID,
    providerId: PROVIDER_ID,
    providerType: "generic",
    kind: "api_key",
    secretRef: {
        type: "provider-file",
        providerId: PROVIDER_ID,
        target: secretRefTarget,
    },
    state: "active",
    createdAt: now,
    updatedAt: now,
    label: PROVIDER_LABEL,
});

interface CredentialStoreDoc {
    schemaVersion: number;
    credentials: Array<Record<string, unknown>>;
}

export const upsertCredentialEntry = (
    doc: CredentialStoreDoc | null,
    entry: Record<string, unknown>,
): { doc: CredentialStoreDoc; changed: boolean } => {
    const current: CredentialStoreDoc = doc ?? {
        schemaVersion: 2,
        credentials: [],
    };
    const credentials = [...current.credentials];
    const index = credentials.findIndex(
        (candidate) => (candidate as { id?: string }).id === entry.id,
    );
    if (index === -1) {
        credentials.push(entry);
        return { doc: { schemaVersion: 2, credentials }, changed: true };
    }
    const existing = credentials[index] as Record<string, unknown>;
    const merged = {
        ...entry,
        // First-seen timestamps survive key reuse.
        ...(typeof existing.createdAt === "string"
            ? { createdAt: existing.createdAt }
            : {}),
    };
    if (JSON.stringify(existing) === JSON.stringify(merged)) {
        return { doc: current, changed: false };
    }
    credentials[index] = merged;
    return { doc: { schemaVersion: 2, credentials }, changed: true };
};

const gatewaySafe = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "");

export const buildUserModelEntry = (
    model: HarnessModel,
    priority: number,
): Record<string, unknown> => ({
    slug: `${PROVIDER_ID}/${model.id}`,
    gatewayModel: `${gatewaySafe(PROVIDER_ID)}-${gatewaySafe(model.id)}`,
    compHash: `${gatewaySafe(PROVIDER_ID)}-${gatewaySafe(model.id)}-user-v1`,
    upstreamModel: model.id,
    provider: PROVIDER_ID,
    listed: true,
    displayName: model.id,
    description: `Pollinations model (polli harness); conservative default metadata.`,
    priority,
    defaultEffort: "high",
    reasoningLevels: [{ effort: "high", description: "Adaptive reasoning" }],
    contextWindow: model.contextWindow,
    autoCompact: 110000,
    inputModalities: model.input,
});

interface UserModelsDoc {
    models?: Array<Record<string, unknown>>;
}

export const upsertUserModel = (
    doc: UserModelsDoc | null,
    entry: Record<string, unknown>,
): { doc: UserModelsDoc; changed: boolean } => {
    const models = [...(doc?.models ?? [])];
    const index = models.findIndex(
        (candidate) =>
            (candidate as { provider?: string }).provider === PROVIDER_ID &&
            (candidate as { upstreamModel?: string }).upstreamModel ===
                entry.upstreamModel,
    );
    if (index === -1) {
        models.push(entry);
        return { doc: { models }, changed: true };
    }
    if (JSON.stringify(models[index]) === JSON.stringify(entry)) {
        return { doc: doc ?? { models }, changed: false };
    }
    models[index] = entry;
    return { doc: { models }, changed: true };
};

export const stripUserModels = (
    doc: UserModelsDoc | null,
): { doc: UserModelsDoc | null; changed: boolean } => {
    if (!doc?.models) return { doc, changed: false };
    const models = doc.models.filter(
        (candidate) =>
            (candidate as { provider?: string }).provider !== PROVIDER_ID,
    );
    if (models.length === doc.models.length) return { doc, changed: false };
    return { doc: { models }, changed: true };
};

// ---------------------------------------------------------------------------
// Router CLI (src/control.mjs runs under plain node — no shell shim needed)
// ---------------------------------------------------------------------------

const runControl = (
    ctx: HarnessContext,
    args: string[],
): { ok: boolean; output: string } => {
    const entry = routerControlEntry(ctx);
    if (!entry) return { ok: false, output: "Codex Router checkout not found" };
    const proc = spawnSync(process.execPath, [entry, "control", ...args], {
        encoding: "utf8",
        timeout: 120_000,
    });
    return {
        ok: proc.status === 0,
        output: `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim(),
    };
};

// ---------------------------------------------------------------------------
// IO wrappers
// ---------------------------------------------------------------------------

const readJson = <T>(path: string): T | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    return JSON.parse(text) as T;
};

const writeJson = (path: string, value: unknown) =>
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);

const readApiKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(stateFilePaths(ctx).apiKey);
    return text === null ? null : text.trim();
};

const writeApiKey = (ctx: HarnessContext, apiKey: string) => {
    const path = stateFilePaths(ctx).apiKey;
    mkdirSync(join(path, ".."), { recursive: true });
    writeTextAtomic(path, `${apiKey}\n`, 0o600);
};

const removeApiKey = (ctx: HarnessContext) => {
    removeIfExists(stateFilePaths(ctx).apiKey);
    const dir = join(stateFilePaths(ctx).apiKey, "..");
    if (existsSync(dir)) {
        try {
            // Remove the credentials dir when our key was its last occupant.
            if (readdirSync(dir).length === 0) removeIfExists(dir);
        } catch {
            // best effort
        }
    }
};

const writeState = (
    ctx: HarnessContext,
    model: HarnessModel,
    apiKey: string,
) => {
    const paths = stateFilePaths(ctx);
    const now = new Date().toISOString();
    const secretTarget = "codex"; // ROUTER_PLANE_TARGET in codex-router

    const providers = upsertGenericProvider(
        readJson(paths.genericProviders),
        buildGenericProvider(CREDENTIAL_ID),
    );
    writeJson(paths.genericProviders, providers.doc);

    const credentials = upsertCredentialEntry(
        readJson(paths.credentialStore),
        buildCredentialEntry(secretTarget, now),
    );
    // Older builds wrote `cred_pollinations`, which the router's store
    // validator rejects (and then ignores the whole store). Replace it.
    let credentialDoc: CredentialStoreDoc = credentials.doc;
    if (
        credentials.doc.credentials.some((entry) =>
            LEGACY_CREDENTIAL_IDS.includes((entry as { id?: string }).id ?? ""),
        )
    ) {
        credentialDoc = {
            schemaVersion: credentialDoc.schemaVersion,
            credentials: credentialDoc.credentials.filter(
                (entry) =>
                    !LEGACY_CREDENTIAL_IDS.includes(
                        (entry as { id?: string }).id ?? "",
                    ),
            ),
        };
    }
    writeJson(paths.credentialStore, credentialDoc);

    writeApiKey(ctx, apiKey);

    const userModels = upsertUserModel(
        readJson(paths.userModels),
        buildUserModelEntry(model, 100),
    );
    writeJson(paths.userModels, userModels.doc);
};

const stripState = (ctx: HarnessContext): boolean => {
    const paths = stateFilePaths(ctx);
    let changed = false;

    const providers = readJson<GenericProviderDoc>(paths.genericProviders);
    if (providers) {
        const next = providers.providers.filter(
            (entry) => (entry as { id?: string }).id !== PROVIDER_ID,
        );
        if (next.length !== providers.providers.length) {
            writeJson(paths.genericProviders, {
                version: providers.version,
                providers: next,
            });
            changed = true;
        }
    }

    const credentials = readJson<CredentialStoreDoc>(paths.credentialStore);
    if (credentials) {
        const next = credentials.credentials.filter(
            (entry) =>
                ![CREDENTIAL_ID, ...LEGACY_CREDENTIAL_IDS].includes(
                    (entry as { id?: string }).id ?? "",
                ),
        );
        if (next.length !== credentials.credentials.length) {
            writeJson(paths.credentialStore, {
                schemaVersion: credentials.schemaVersion,
                credentials: next,
            });
            changed = true;
        }
    }

    const models = stripUserModels(readJson(paths.userModels));
    if (models.changed) {
        writeJson(paths.userModels, models.doc);
        changed = true;
    }

    if (readApiKey(ctx) !== null) {
        removeApiKey(ctx);
        changed = true;
    }
    return changed;
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const statusResult = (ctx: HarnessContext): HarnessResult => {
    const paths = stateFilePaths(ctx);
    const providers = readJson<GenericProviderDoc>(paths.genericProviders);
    const credentials = readJson<CredentialStoreDoc>(paths.credentialStore);
    const userModels = readJson<UserModelsDoc>(paths.userModels);
    const provider = providers?.providers.find(
        (entry) => (entry as { id?: string }).id === PROVIDER_ID,
    );
    const credential = credentials?.credentials.find((entry) =>
        [CREDENTIAL_ID, ...LEGACY_CREDENTIAL_IDS].includes(
            (entry as { id?: string }).id ?? "",
        ),
    );
    const ours = (userModels?.models ?? []).filter(
        (entry) => (entry as { provider?: string }).provider === PROVIDER_ID,
    );
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider !== undefined &&
            credential !== undefined &&
            readApiKey(ctx) !== null,
        model: ours.at(-1)
            ? ((ours.at(-1) as { upstreamModel?: string }).upstreamModel ??
              undefined)
            : undefined,
        files: files(ctx),
        router: routerControlEntry(ctx) ?? routerHome(ctx),
        wired: isRouterWired(readTextIfExists(configTomlPath(ctx))),
        provider: provider !== undefined,
        credential: credential !== undefined && readApiKey(ctx) !== null,
    } as HarnessResult & Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const INSTALL_HINT =
    "Install Codex Router first — Windows: the PowerShell installer at " +
    "https://github.com/duolahypercho/codex-router (install.ps1 -Target codex -Guided); " +
    "macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/duolahypercho/codex-router/main/install.sh | sh -s -- --target codex --guided`. " +
    "Codex Router needs Node.js 22.19+ and Python 3.10+/uv.";

export const configureCodex = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: HarnessModel },
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        // Router-owned wiring: only bootstrap when it is not there yet, and
        // never remove it on `off` — other providers may live beside ours.
        if (!isRouterWired(readTextIfExists(configTomlPath(ctx)))) {
            const setup = runControl(ctx, ["client-setup", "codex"]);
            if (!setup.ok) {
                throw new Error(
                    `Codex Router client-setup failed: ${setup.output}`,
                );
            }
        }
        writeState(ctx, settings.model, settings.apiKey);
    });
    const applied = runControl(ctx, ["apply"]);
    if (!applied.ok) {
        // State files are correct; the picker catches up on the next
        // router restart. Never fail `on` for a stopped service.
        printWarn(`Codex Router apply skipped: ${applied.output}`);
    }
    return statusResult(ctx);
};

export const disableCodex = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripState(ctx));
    const applied = runControl(ctx, ["apply"]);
    if (!applied.ok) {
        printWarn(`Codex Router apply skipped: ${applied.output}`);
    }
    return { ...statusResult(ctx), configured: false, outcome };
};

const codexInstalled = (ctx: HarnessContext) =>
    commandExists("codex", ctx.env, [join(ctx.home, ".codex", "bin", "codex")]);

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Codex to use Pollinations through Codex Router",
    restartHint:
        "Fully quit and reopen Codex, then pick a Pollinations model from the picker (models are listed as pollinations/<id>).",

    async on(ctx, options) {
        if (!codexInstalled(ctx)) {
            throw new Error(
                `Codex was not found on PATH. Install the Codex CLI first: https://developers.openai.com/codex — then re-run polli harness codex on.`,
            );
        }
        if (!routerControlEntry(ctx)) {
            throw new Error(
                `Codex Router was not found at ${routerHome(ctx)}. ${INSTALL_HINT}`,
            );
        }
        const modelId = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(modelId);
        const model = models.find(
            (entry) => entry.id === modelId,
        ) as HarnessModel;
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readApiKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        const smoke = await smokeChat(apiKey, model.id);
        if (!smoke.ok) {
            throw new Error(
                `Smoke request failed before any config change: ${smoke.detail}`,
            );
        }
        const result = configureCodex(ctx, { apiKey, model });
        printInfo(`Smoke request ok ("${smoke.detail}").`);
        return result;
    },

    off: disableCodex,
    status: statusResult,
};
