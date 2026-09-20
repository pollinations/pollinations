import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
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
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex Router";
const PROVIDER = "pollinations";
const PROVIDER_NAME = "Pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const STATE_DIR = "codex-router";
const ROUTER_MARKER = "# >>> codex-router start";
const COMMAND_TIMEOUT_MS = 180_000;

const CODEX_HINT = "Install the Codex CLI first: npm install -g @openai/codex";
const ROUTER_HINT =
    "Install Codex Router first: curl -fsSL https://raw.githubusercontent.com/duolahypercho/codex-router/main/install.sh | sh -s -- --target codex --guided";

export const codexHome = (ctx: HarnessContext) => {
    const configured = ctx.env.CODEX_HOME;
    if (!configured?.trim()) return join(ctx.home, ".codex");
    return resolveHomePath(ctx.home, configured);
};

const routerStateDir = (ctx: HarnessContext) => join(codexHome(ctx), STATE_DIR);
const configPath = (ctx: HarnessContext) => join(codexHome(ctx), "config.toml");
const manifestPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "install-manifest.json");
const providersPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "generic-providers.json");
const credentialsPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "provider-credentials.json");
const credentialKeyPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "generic-provider-credentials", `${PROVIDER}.key`);
const userModelsPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "user-models.json");
const mergedModelsPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "merged-models.json");
const defaultModelPath = (ctx: HarnessContext) =>
    join(routerStateDir(ctx), "codex-default-model.json");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    providersPath(ctx),
    credentialsPath(ctx),
    credentialKeyPath(ctx),
    userModelsPath(ctx),
    mergedModelsPath(ctx),
    defaultModelPath(ctx),
];

interface GenericProvider {
    id: string;
    displayName?: string;
    baseUrl?: string;
    adapter?: string;
    credentialRef?: string | null;
    enabled?: boolean;
}

interface CredentialRecord {
    id: string;
    providerId: string;
    providerType: string;
    kind: string;
    secretRef: { type: string; providerId: string; target: string };
    state: string;
    createdAt: string;
    updatedAt: string;
    label: string;
}

const readJson = <T>(path: string, fallback: T): T => {
    const text = readTextIfExists(path);
    if (text === null) return fallback;
    try {
        return JSON.parse(text) as T;
    } catch {
        return fallback;
    }
};

/** Repository the installed router runs from, recorded by its installer. */
export const codexRouterRoot = (ctx: HarnessContext): string | null => {
    const manifest = readJson<{ current?: { sourceRoot?: unknown } }>(
        manifestPath(ctx),
        {},
    );
    const root = manifest.current?.sourceRoot;
    return typeof root === "string" && root.trim() ? root : null;
};

const runRouter = (
    root: string,
    script: string,
    args: string[],
    env: NodeJS.ProcessEnv,
) => {
    const result = spawnSync(
        process.execPath,
        [join(root, "src", script), ...args],
        {
            env: { ...process.env, ...env },
            encoding: "utf-8",
            timeout: COMMAND_TIMEOUT_MS,
        },
    );
    if (result.error) {
        throw new Error(
            `Codex Router command failed (${basename(script)}): ${result.error.message}`,
        );
    }
    if (result.status !== 0) {
        const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`
            .trim()
            .split("\n")
            .filter(Boolean)
            .at(-1);
        throw new Error(
            `Codex Router command failed (${basename(script)} ${args.join(" ")})${detail ? `: ${detail}` : ` with exit code ${result.status}`}`,
        );
    }
    return result.stdout ?? "";
};

const providerEntry = (ctx: HarnessContext) =>
    readJson<{ providers?: GenericProvider[] }>(providersPath(ctx), {})
        .providers?.find((provider) => provider.id === PROVIDER) ?? null;

const credentialStore = (ctx: HarnessContext) =>
    readJson<{ schemaVersion?: number; credentials?: CredentialRecord[] }>(
        credentialsPath(ctx),
        {},
    );

const readKey = (ctx: HarnessContext) => {
    const key = readTextIfExists(credentialKeyPath(ctx))?.trim();
    return key ? key : null;
};

const configText = (ctx: HarnessContext) => readTextIfExists(configPath(ctx)) ?? "";

const routerEnabled = (ctx: HarnessContext) =>
    configText(ctx).includes(ROUTER_MARKER);

const readDefaultModel = (ctx: HarnessContext): string | undefined => {
    const match = /^\s*model\s*=\s*"([^"]*)"/mu.exec(configText(ctx));
    const value = match?.[1];
    return value?.startsWith(`${PROVIDER}/`)
        ? value.slice(PROVIDER.length + 1)
        : undefined;
};

const hasCuratedModels = (ctx: HarnessContext) =>
    (
        readJson<{ models?: { provider?: string }[] }>(userModelsPath(ctx), {})
            .models ?? []
    ).some((model) => model.provider === PROVIDER);

const result = (ctx: HarnessContext): HarnessResult => {
    const provider = providerEntry(ctx);
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.enabled === true &&
            Boolean(provider.credentialRef) &&
            readKey(ctx) !== null &&
            routerEnabled(ctx) &&
            hasCuratedModels(ctx),
        model: readDefaultModel(ctx),
        files: files(ctx),
    };
};

const writeCredential = (ctx: HarnessContext, apiKey: string) => {
    const store = credentialStore(ctx);
    const existing = (store.credentials ?? []).find(
        (credential) => credential.providerId === PROVIDER,
    );
    const now = new Date().toISOString();
    const record: CredentialRecord = {
        id: existing?.id ?? `cred_${randomBytes(16).toString("base64url")}`,
        providerId: PROVIDER,
        providerType: "generic",
        kind: "api_key",
        secretRef: {
            type: "provider-file",
            providerId: PROVIDER,
            target: "codex",
        },
        state: "active",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        label: `${PROVIDER_NAME} API key`,
    };
    writeTextAtomic(
        credentialsPath(ctx),
        `${JSON.stringify(
            {
                schemaVersion: store.schemaVersion ?? 2,
                credentials: [
                    ...(store.credentials ?? []).filter(
                        (credential) => credential.providerId !== PROVIDER,
                    ),
                    record,
                ],
            },
            null,
            2,
        )}\n`,
        0o600,
    );
    writeTextAtomic(credentialKeyPath(ctx), `${apiKey}\n`, 0o600);
    return record.id;
};

interface CodexRouterSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    root: string;
}

const writeConfig = (ctx: HarnessContext, settings: CodexRouterSettings) => {
    const credentialRef = writeCredential(ctx, settings.apiKey);
    runRouter(
        settings.root,
        "providers.mjs",
        [
            "generic",
            providerEntry(ctx) ? "edit" : "add",
            PROVIDER,
            "--name",
            PROVIDER_NAME,
            "--base-url",
            `${BASE_URL}/v1`,
            "--adapter",
            "openai-chat",
            "--credential-ref",
            credentialRef,
        ],
        ctx.env,
    );
    runRouter(
        settings.root,
        "curate-models.mjs",
        [
            PROVIDER,
            "--models",
            settings.models.map((model) => model.id).join(","),
            "--apply",
        ],
        // The catalog we curate is the live Pollinations one we just fetched,
        // so the router must not skip credential resolution because its own
        // discovery switch happens to be off.
        { ...ctx.env, CODEX_ROUTER_NO_DISCOVERY: "0" },
    );
    if (!routerEnabled(ctx)) {
        runRouter(settings.root, "config-manager.mjs", ["enable"], ctx.env);
    }
    runRouter(
        settings.root,
        "config-manager.mjs",
        ["router-default-set", `${PROVIDER}/${settings.model}`],
        ctx.env,
    );
};

// `router-default-clear` only rewrites config.toml while its state file still
// claims the current model. When that file was removed or rewritten outside
// polli, adopt the Pollinations model we can actually see so the official clear
// drops it, instead of leaving a dangling `model = "pollinations/..."` line.
const adoptStaleDefaultModel = (ctx: HarnessContext) => {
    const current = readDefaultModel(ctx);
    if (current === undefined) return;
    const stateText = readTextIfExists(defaultModelPath(ctx));
    if (stateText !== null) {
        try {
            const parsed = JSON.parse(stateText) as { model?: unknown };
            if (parsed?.model === `${PROVIDER}/${current}`) return;
        } catch {
            // A corrupt state file is exactly what this repair is for.
        }
    }
    writeTextAtomic(
        defaultModelPath(ctx),
        `${JSON.stringify(
            { version: 1, model: `${PROVIDER}/${current}`, previousPresent: false },
            null,
            2,
        )}\n`,
        0o600,
    );
};

const stripConfig = (ctx: HarnessContext) => {
    const root = codexRouterRoot(ctx);
    let changed = false;
    if (root && providerEntry(ctx)) {
        runRouter(root, "providers.mjs", ["generic", "remove", PROVIDER], ctx.env);
        changed = true;
    }
    if (
        root &&
        (readDefaultModel(ctx) !== undefined ||
            readTextIfExists(defaultModelPath(ctx)) !== null)
    ) {
        adoptStaleDefaultModel(ctx);
        runRouter(root, "config-manager.mjs", ["router-default-clear"], ctx.env);
        changed = true;
    }
    if (readKey(ctx) !== null) {
        removeIfExists(credentialKeyPath(ctx));
        changed = true;
    }
    const store = credentialStore(ctx);
    const credentials = (store.credentials ?? []).filter(
        (credential) => credential.providerId !== PROVIDER,
    );
    if (credentials.length !== (store.credentials ?? []).length) {
        writeTextAtomic(
            credentialsPath(ctx),
            `${JSON.stringify(
                { schemaVersion: store.schemaVersion ?? 2, credentials },
                null,
                2,
            )}\n`,
            0o600,
        );
        changed = true;
    }
    return changed;
};

export const configureCodexRouter = (
    ctx: HarnessContext,
    settings: CodexRouterSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableCodexRouter = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Route Codex through Codex Router to Pollinations models",
    restartHint:
        "Fully quit and reopen Codex, then pick a Pollinations model with /model.",

    async on(ctx, options) {
        const root = codexRouterRoot(ctx);
        if (!root || !existsSync(join(root, "src", "providers.mjs"))) {
            throw new Error(`Codex Router was not found. ${ROUTER_HINT}`);
        }
        if (
            !commandExists("codex", ctx.env, [
                join(ctx.home, ".local", "bin", "codex"),
            ])
        ) {
            throw new Error(`Codex was not found. ${CODEX_HINT}`);
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureCodexRouter(ctx, { apiKey, model, models, root });
    },

    off: disableCodexRouter,
    status: result,
};
