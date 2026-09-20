import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { smokeTest } from "./smoke.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "codex";
const LABEL = "Codex";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
// The router plane is always addressed as "codex" internally (one shared
// installation configures every client it supports), independent of which
// client this adapter is wiring up.
const ROUTER_PLANE_TARGET = "codex";
// Fixed rather than random so re-running `on` updates the same credential
// instead of leaking a new one on every call.
const CRED_ID = "cred_pollinations_codex";

/**
 * Codex Router (https://github.com/duolahypercho/codex-router) keeps its own
 * state under `~/.codex/codex-router/` (or `$CODEX_ROUTER_STATE_DIR`), inside
 * Codex CLI's own home (`$CODEX_HOME`, default `~/.codex`). A user-added
 * OpenAI-compatible provider is a "generic provider": a descriptor in
 * `generic-providers.json`, a credential-store entry in
 * `provider-credentials.json` that only carries a reference, and the actual
 * key in its own 0600 file under `generic-provider-credentials/`. The router
 * validates this registry strictly and has no documented mechanism for a
 * generic provider to authenticate any other way (a static `Authorization`
 * header is rejected outright as credential-shaped).
 */
export const codexHome = (ctx: HarnessContext) => {
    const configured = ctx.env.CODEX_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : join(ctx.home, ".codex");
};

export const codexRouterStateDir = (ctx: HarnessContext) => {
    const configured = ctx.env.CODEX_ROUTER_STATE_DIR?.trim();
    if (configured) return resolveHomePath(ctx.home, configured);
    return join(codexHome(ctx), "codex-router");
};

const configTomlPath = (ctx: HarnessContext) =>
    join(codexHome(ctx), "config.toml");
const genericProvidersPath = (ctx: HarnessContext) =>
    join(codexRouterStateDir(ctx), "generic-providers.json");
const credentialStorePath = (ctx: HarnessContext) =>
    join(codexRouterStateDir(ctx), "provider-credentials.json");
const credentialSecretPath = (ctx: HarnessContext) =>
    join(
        codexRouterStateDir(ctx),
        "generic-provider-credentials",
        `${PROVIDER}.key`,
    );

// Only the files this adapter owns end to end. `config.toml`'s router-wired
// block is shared plumbing the router itself manages for every provider, so
// it is bootstrapped once via the router's own command and never snapshotted
// or stripped here -- removing it on `off` would disconnect Codex from the
// router entirely, including providers this harness never touched.
const files = (ctx: HarnessContext) => [
    genericProvidersPath(ctx),
    credentialStorePath(ctx),
    credentialSecretPath(ctx),
];

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const saveJson = (path: string, data: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
};

const providersArray = (
    doc: Record<string, unknown>,
): Record<string, unknown>[] =>
    Array.isArray(doc.providers)
        ? (doc.providers as Record<string, unknown>[])
        : [];

const credentialsArray = (
    doc: Record<string, unknown>,
): Record<string, unknown>[] =>
    Array.isArray(doc.credentials)
        ? (doc.credentials as Record<string, unknown>[])
        : [];

const providerDescriptor = () => ({
    id: PROVIDER,
    displayName: "Pollinations.ai",
    adapter: "openai-chat",
    baseUrl: `${BASE_URL}/v1`,
    headers: {},
    credentialRef: CRED_ID,
    allowPrivate: false,
    enabled: true,
});

const writeProvider = (ctx: HarnessContext) => {
    const path = genericProvidersPath(ctx);
    const doc = loadJson(path);
    if (doc.version === undefined) doc.version = 1;
    const providers = providersArray(doc).filter((p) => p.id !== PROVIDER);
    providers.push(providerDescriptor());
    doc.providers = providers;
    saveJson(path, doc);
};

const writeCredential = (ctx: HarnessContext, apiKey: string) => {
    const now = new Date().toISOString();
    const path = credentialStorePath(ctx);
    const doc = loadJson(path);
    if (doc.schemaVersion === undefined) doc.schemaVersion = 2;
    const credentials = credentialsArray(doc).filter((c) => c.id !== CRED_ID);
    const existing = credentialsArray(doc).find((c) => c.id === CRED_ID);
    credentials.push({
        id: CRED_ID,
        providerId: PROVIDER,
        providerType: "generic",
        kind: "api_key",
        secretRef: {
            type: "provider-file",
            providerId: PROVIDER,
            target: ROUTER_PLANE_TARGET,
        },
        state: "active",
        label: "Pollinations.ai API key",
        createdAt: (existing?.createdAt as string | undefined) ?? now,
        updatedAt: now,
    });
    doc.credentials = credentials;
    saveJson(path, doc);
    writeTextAtomic(credentialSecretPath(ctx), `${apiKey}\n`, 0o600);
};

const readKey = (ctx: HarnessContext): string | null => {
    const key = readTextIfExists(credentialSecretPath(ctx));
    return key?.trim() ? key.trim() : null;
};

const hasBootstrap = (ctx: HarnessContext) => {
    const toml = readTextIfExists(configTomlPath(ctx));
    return toml?.includes("codex-router-managed") ?? false;
};

/** `codex-router control client-setup codex` writes the shared router-plane
 * wiring into `config.toml`. It is idempotent on the router's side, but is
 * only invoked here when that wiring is missing so a fresh `on` never touches
 * a marker block it did not create. */
const bootstrapRouter = (ctx: HarnessContext) => {
    if (hasBootstrap(ctx)) return;
    const setup = spawnSync(
        "codex-router",
        ["control", "client-setup", ROUTER_PLANE_TARGET],
        { env: ctx.env, stdio: "ignore" },
    );
    if (setup.error) throw setup.error;
    if (setup.status !== 0) {
        throw new Error("codex-router control client-setup codex failed");
    }
};

const publishCatalog = (ctx: HarnessContext, model: string) => {
    const discover = spawnSync("codex-router", ["discover-models", PROVIDER], {
        env: ctx.env,
        stdio: "ignore",
    });
    if (discover.error) throw discover.error;
    if (discover.status !== 0) {
        throw new Error(`codex-router discover-models ${PROVIDER} failed`);
    }
    const setModel = spawnSync(
        "codex-router",
        ["control", "model-set", `${PROVIDER}/${model}`],
        { env: ctx.env, stdio: "ignore" },
    );
    if (setModel.error) throw setModel.error;
    if (setModel.status !== 0) {
        throw new Error(
            `codex-router control model-set ${PROVIDER}/${model} failed`,
        );
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;

    const providersPath = genericProvidersPath(ctx);
    const providersDoc = loadJson(providersPath);
    const providers = providersArray(providersDoc);
    if (providers.some((p) => p.id === PROVIDER)) {
        providersDoc.providers = providers.filter((p) => p.id !== PROVIDER);
        saveJson(providersPath, providersDoc);
        changed = true;
    }

    const credPath = credentialStorePath(ctx);
    const credDoc = loadJson(credPath);
    const credentials = credentialsArray(credDoc);
    if (credentials.some((c) => c.id === CRED_ID)) {
        credDoc.credentials = credentials.filter((c) => c.id !== CRED_ID);
        saveJson(credPath, credDoc);
        changed = true;
    }

    if (readTextIfExists(credentialSecretPath(ctx)) !== null) {
        removeIfExists(credentialSecretPath(ctx));
        changed = true;
    }

    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const providersDoc = loadJson(genericProvidersPath(ctx));
    const provider = providersArray(providersDoc).find(
        (p) => p.id === PROVIDER,
    );
    const credDoc = loadJson(credentialStorePath(ctx));
    const credential = credentialsArray(credDoc).find((c) => c.id === CRED_ID);
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.adapter === "openai-chat" &&
            provider?.credentialRef === CRED_ID &&
            provider?.enabled === true &&
            credential?.state === "active" &&
            readKey(ctx) !== null,
        files: files(ctx),
    };
};

interface CodexSettings {
    apiKey: string;
    model: string;
}

const writeConfig = (ctx: HarnessContext, settings: CodexSettings) => {
    bootstrapRouter(ctx);
    writeProvider(ctx);
    writeCredential(ctx, settings.apiKey);
    publishCatalog(ctx, settings.model);
};

export const configureCodex = (
    ctx: HarnessContext,
    settings: CodexSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableCodex = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

const codexInstalled = (ctx: HarnessContext) => commandExists("codex", ctx.env);
const codexRouterInstalled = (ctx: HarnessContext) =>
    commandExists("codex-router", ctx.env);

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Codex to use Pollinations through Codex Router",
    restartHint:
        "Restart Codex, then pick the model with /model if you did not pass --model.",

    async on(ctx, options) {
        if (!codexInstalled(ctx)) {
            throw new Error(
                "Codex was not found. Install it first: npm install -g @openai/codex",
            );
        }
        if (!codexRouterInstalled(ctx)) {
            throw new Error(
                "Codex Router was not found. Install it first: curl -fsSL https://raw.githubusercontent.com/duolahypercho/codex-router/main/install.sh | sh -s -- --target codex --guided --with-tray",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        // codex-router discovers Pollinations' catalog live itself; this call
        // only validates that `model` is a real tool-calling model before any
        // config is written.
        await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        const configured = configureCodex(ctx, { apiKey, model });
        await smokeTest(apiKey, model);
        return configured;
    },

    off: disableCodex,
    status: result,
};
