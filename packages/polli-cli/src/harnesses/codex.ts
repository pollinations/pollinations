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
const ADAPTER = "openai-chat";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
/** Marker stored in the provider description; `off` only removes providers carrying it. */
const OWNERSHIP_MARKER = "polli harness codex";
const PROVIDER_DESCRIPTION = `${OWNERSHIP_MARKER} (managed by polli; run \`polli harness codex off\` to disconnect)`;

/** One codex-router invocation. Secrets travel via stdin, never argv. */
export interface RouterRun {
    command: string;
    args: string[];
    stdin?: string;
}

export interface RouterRunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/** Runs the codex-router CLI; injectable so tests never spawn a real process. */
export type RouterRunner = (run: RouterRun) => RouterRunResult;

const defaultRouterRunner: RouterRunner = ({ command, args, stdin }) => {
    const result = spawnSync(command, args, {
        input: stdin ?? "",
        encoding: "utf-8",
    });
    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? result.error?.message ?? "",
    };
};

const envValue = (ctx: HarnessContext, name: string): string | undefined => {
    const value = ctx.env[name]?.trim();
    return value ? value : undefined;
};

/**
 * Router state root:
 * $MODEL_ROUTER_STATE_DIR || $CODEX_ROUTER_STATE_DIR || $KIMI_CODEX_STATE_DIR
 * || $CODEX_HOME/codex-router.
 */
export const stateDir = (ctx: HarnessContext): string => {
    const configured =
        envValue(ctx, "MODEL_ROUTER_STATE_DIR") ??
        envValue(ctx, "CODEX_ROUTER_STATE_DIR") ??
        envValue(ctx, "KIMI_CODEX_STATE_DIR");
    if (configured) return resolveHomePath(ctx.home, configured);
    const codexHome = envValue(ctx, "CODEX_HOME") ?? "~/.codex";
    return join(resolveHomePath(ctx.home, codexHome), "codex-router");
};

const overriddenPath = (
    ctx: HarnessContext,
    name: string,
    fallback: string,
): string => {
    const configured = envValue(ctx, name);
    return configured ? resolveHomePath(ctx.home, configured) : fallback;
};

export interface CodexStatePaths {
    providers: string;
    credentials: string;
    userModels: string;
    picker: string;
    key: string;
}

/**
 * Files the integration mutates. model-picker.json and the credential
 * directory have no env override in codex-router.
 */
export const statePaths = (ctx: HarnessContext): CodexStatePaths => {
    const dir = stateDir(ctx);
    return {
        providers: overriddenPath(
            ctx,
            "MODEL_ROUTER_GENERIC_PROVIDERS",
            join(dir, "generic-providers.json"),
        ),
        credentials: overriddenPath(
            ctx,
            "MODEL_ROUTER_PROVIDER_CREDENTIAL_STORE",
            join(dir, "provider-credentials.json"),
        ),
        userModels: overriddenPath(
            ctx,
            "MODEL_ROUTER_USER_MODELS",
            join(dir, "user-models.json"),
        ),
        picker: join(dir, "model-picker.json"),
        key: join(dir, "generic-provider-credentials", `${PROVIDER}.key`),
    };
};

const files = (ctx: HarnessContext): string[] => {
    const paths = statePaths(ctx);
    return [
        paths.providers,
        paths.credentials,
        paths.userModels,
        paths.picker,
        paths.key,
    ];
};

/** Managed checkout fallback installed by codex-router's install.sh. */
export const routerCliFallback = (ctx: HarnessContext): string =>
    resolveHomePath(ctx.home, "~/.local/share/codex-router/bin/codex-router");

/** codex-router from PATH (preferred) or the managed checkout; null when absent. */
export const resolveRouterCli = (ctx: HarnessContext): string | null => {
    if (commandExists("codex-router", ctx.env)) return "codex-router";
    const fallback = routerCliFallback(ctx);
    return commandExists("codex-router", ctx.env, [fallback]) ? fallback : null;
};

type JsonObject = Record<string, unknown>;

const loadJson = (path: string): JsonObject | null => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return null;
    return JSON.parse(text) as JsonObject;
};

const saveJson = (path: string, value: unknown) => {
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);
};

interface GenericProviderEntry {
    id?: string;
    description?: string;
    enabled?: boolean;
    baseUrl?: string;
    adapter?: string;
    credentialRef?: string;
}

const providerEntries = (data: JsonObject | null): GenericProviderEntry[] =>
    data && Array.isArray(data.providers)
        ? (data.providers as GenericProviderEntry[])
        : [];

const credentialEntries = (data: JsonObject | null): JsonObject[] =>
    data && Array.isArray(data.credentials)
        ? (data.credentials as JsonObject[])
        : [];

const isOwnedProvider = (
    entry: GenericProviderEntry | null | undefined,
): boolean =>
    typeof entry?.description === "string" &&
    entry.description.includes(OWNERSHIP_MARKER);

const findProvider = (ctx: HarnessContext): GenericProviderEntry | null =>
    providerEntries(loadJson(statePaths(ctx).providers)).find(
        (entry) => entry.id === PROVIDER,
    ) ?? null;

const findActiveCredential = (ctx: HarnessContext): JsonObject | null =>
    credentialEntries(loadJson(statePaths(ctx).credentials)).find(
        (entry) =>
            entry.providerId === PROVIDER &&
            entry.kind === "api_key" &&
            entry.state === "active",
    ) ?? null;

/** The dedicated child key we created earlier, if it is still on disk. */
const readKey = (ctx: HarnessContext): string | null => {
    const key = readTextIfExists(statePaths(ctx).key)?.trim();
    return key ? key : null;
};

const runCli = (
    cli: string,
    runner: RouterRunner,
    args: string[],
    stdin?: string,
): RouterRunResult => {
    const result = runner({ command: cli, args, stdin });
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout).trim();
        throw new Error(
            `codex-router ${args.slice(0, 4).join(" ")} failed${detail ? `: ${detail}` : ""}`,
        );
    }
    return result;
};

/** Idempotent: keeps an existing pollinations provider, refuses a foreign one. */
const ensureProvider = (
    ctx: HarnessContext,
    cli: string,
    runner: RouterRunner,
) => {
    const existing = findProvider(ctx);
    if (existing && !isOwnedProvider(existing)) {
        throw new Error(
            `codex-router already has a generic provider "${PROVIDER}" that polli does not own. ` +
                `Remove it first (codex-router providers generic remove ${PROVIDER}) or connect it by hand.`,
        );
    }
    if (!existing) {
        runCli(cli, runner, [
            "providers",
            "generic",
            "add",
            PROVIDER,
            "--name",
            "Pollinations",
            "--base-url",
            `${BASE_URL}/v1`,
            "--adapter",
            ADAPTER,
            "--description",
            PROVIDER_DESCRIPTION,
        ]);
        return;
    }
    if (existing.enabled === false) {
        runCli(cli, runner, ["providers", "generic", "enable", PROVIDER]);
    }
};

const setCredential = (cli: string, runner: RouterRunner, apiKey: string) => {
    runCli(
        cli,
        runner,
        [
            "providers",
            "generic",
            "credential",
            PROVIDER,
            "set",
            "--stdin",
            "--json",
        ],
        `${apiKey}\n`,
    );
};

const curateModels = (
    cli: string,
    runner: RouterRunner,
    models: HarnessModel[],
) => {
    runCli(cli, runner, [
        "curate-models",
        PROVIDER,
        "--models",
        models.map((model) => model.id).join(","),
        "--apply",
    ]);
};

const isOwnedModel = (entry: unknown): boolean => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as JsonObject;
    if (record.provider === PROVIDER) return true;
    return isOwnedSlug(record.slug);
};

const isOwnedSlug = (value: unknown): boolean =>
    typeof value === "string" &&
    (value === PROVIDER || value.startsWith(`${PROVIDER}/`));

/**
 * Remove only our artifacts (matched by the ownership marker / provider id) so
 * unrelated user edits survive. Throws on corrupt JSON, keeping the snapshot.
 */
const stripArtifacts = (ctx: HarnessContext): boolean => {
    const paths = statePaths(ctx);
    let changed = false;
    let removedOwnedProvider = false;

    const providersText = readTextIfExists(paths.providers);
    if (providersText?.trim()) {
        const data = loadJson(paths.providers);
        if (data) {
            const entries = providerEntries(data);
            const remaining = entries.filter(
                (entry) => !(entry.id === PROVIDER && isOwnedProvider(entry)),
            );
            if (remaining.length !== entries.length) {
                saveJson(paths.providers, { ...data, providers: remaining });
                changed = true;
                removedOwnedProvider = true;
            }
        }
    }

    if (removedOwnedProvider) {
        const credentialsText = readTextIfExists(paths.credentials);
        if (credentialsText?.trim()) {
            const data = loadJson(paths.credentials);
            if (data) {
                const entries = credentialEntries(data);
                const remaining = entries.filter(
                    (entry) => entry.providerId !== PROVIDER,
                );
                if (remaining.length !== entries.length) {
                    saveJson(paths.credentials, {
                        ...data,
                        credentials: remaining,
                    });
                    changed = true;
                }
            }
        }
        if (readTextIfExists(paths.key) !== null) {
            removeIfExists(paths.key);
            changed = true;
        }
    }

    const userModelsText = readTextIfExists(paths.userModels);
    if (userModelsText?.trim()) {
        const data = loadJson(paths.userModels);
        if (data && Array.isArray(data.models)) {
            const entries = data.models as unknown[];
            const remaining = entries.filter((entry) => !isOwnedModel(entry));
            if (remaining.length !== entries.length) {
                saveJson(paths.userModels, { ...data, models: remaining });
                changed = true;
            }
        }
    }

    const pickerText = readTextIfExists(paths.picker);
    if (pickerText?.trim()) {
        const data = loadJson(paths.picker);
        if (data) {
            let pickerChanged = false;
            for (const field of ["hidden", "seeded", "visible", "order"]) {
                const value = data[field];
                if (Array.isArray(value)) {
                    const remaining = value.filter(
                        (item) => !isOwnedSlug(item),
                    );
                    if (remaining.length !== value.length) {
                        data[field] = remaining;
                        pickerChanged = true;
                    }
                } else if (value && typeof value === "object") {
                    const record = value as JsonObject;
                    const keys = Object.keys(record).filter(isOwnedSlug);
                    if (keys.length > 0) {
                        for (const key of keys) delete record[key];
                        pickerChanged = true;
                    }
                }
            }
            if (pickerChanged) {
                saveJson(paths.picker, data);
                changed = true;
            }
        }
    }

    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const provider = findProvider(ctx);
    const owned = isOwnedProvider(provider);
    const hasKey = readKey(ctx) !== null;
    const credentialOk =
        !provider?.credentialRef ||
        (findActiveCredential(ctx) !== null && hasKey);

    return {
        harness: ID,
        label: LABEL,
        configured: owned && provider?.enabled !== false && credentialOk,
        files: files(ctx),
    };
};

export interface CodexSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

/**
 * Wire codex-router to Pollinations. All steps run under one snapshot, so a
 * failed step restores the pre-`on` state of every touched file.
 */
export const configureCodex = (
    ctx: HarnessContext,
    settings: CodexSettings,
    runner: RouterRunner = defaultRouterRunner,
): HarnessResult => {
    const apiKey = settings.apiKey.trim();
    if (!apiKey) {
        throw new Error("No Pollinations API key is available for Codex.");
    }
    if (settings.models.length === 0) {
        throw new Error(
            "No tool-calling Pollinations models are available for Codex.",
        );
    }

    const cli = resolveRouterCli(ctx) ?? "codex-router";
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        ensureProvider(ctx, cli, runner);
        setCredential(cli, runner, apiKey);
        curateModels(cli, runner, settings.models);
    });
    return result(ctx);
};

/** Restore pre-`on` state (or strip only our entries), then revoke the key. */
export const disableCodex = (
    ctx: HarnessContext,
    runner: RouterRunner = defaultRouterRunner,
): HarnessResult => {
    const cli = resolveRouterCli(ctx);
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () =>
        stripArtifacts(ctx),
    );
    if (cli) {
        const revoke = runner({
            command: cli,
            args: [
                "providers",
                "generic",
                "credential",
                PROVIDER,
                "remove",
                "--json",
            ],
        });
        const detail = `${revoke.stderr}\n${revoke.stdout}`;
        const alreadyGone =
            /not configured|no credential|unknown generic provider/i.test(
                detail,
            );
        if (revoke.status !== 0 && !alreadyGone) {
            throw new Error(
                `codex-router could not revoke the Pollinations credential${detail.trim() ? `: ${detail.trim()}` : ""}`,
            );
        }
    }
    return { ...result(ctx), configured: false, outcome };
};

export const codex: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Connect Codex to Pollinations through Codex Router",
    restartHint:
        "Restart Codex to pick up the new models. Codex Router republishes its model picker automatically.",

    async on(ctx, options) {
        const cli = resolveRouterCli(ctx);
        if (!cli) {
            throw new Error(
                "Codex Router (codex-router) was not found. Install it first — " +
                    "the managed checkout lives at ~/.local/share/codex-router.",
            );
        }
        if (!commandExists("codex", ctx.env)) {
            throw new Error(
                "Codex was not found. Install it first: npm install -g @openai/codex",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureCodex(ctx, { apiKey, model, models });
    },

    off: (ctx) => disableCodex(ctx),
    status: result,
};
