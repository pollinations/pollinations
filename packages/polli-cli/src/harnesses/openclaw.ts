import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { gen } from "../lib/api.js";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, resolveHarnessPath, writeTextAtomic } from "./fs.js";
import {
    inspectHarnessKey,
    normalizeSecretKey,
    resolveHarnessKey,
    withHarnessKeyLease,
} from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type { HarnessSnapshot } from "./snapshot.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    harnessSnapshotPath,
    loadHarnessSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";
const CONFIG_NAME = "openclaw.json";
const PROVIDER_BASE_URL = `${BASE_URL}/v1`;
const KEY_REFERENCE = `\${${KEY_ENV}}`;
const SEARCH_MODEL = "perplexity-fast";
const MANAGED_PROVIDER_KEYS = ["baseUrl", "api", "apiKey", "models"] as const;
const MANAGED_SEARCH_KEYS = ["provider", "perplexity"] as const;
const ONBOARD_ARGS = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--mode",
    "local",
    "--flow",
    "quickstart",
    "--auth-choice",
    "custom-api-key",
    "--custom-base-url",
    PROVIDER_BASE_URL,
    "--custom-provider-id",
    PROVIDER,
    "--custom-model-id",
    DEFAULT_MODEL,
    "--custom-api-key",
    KEY_REFERENCE,
    "--secret-input-mode",
    "plaintext",
    "--skip-channels",
    "--skip-daemon",
    "--skip-skills",
    "--skip-ui",
    "--skip-health",
];

type JsonObject = Record<string, unknown>;

interface OpenClawConfig {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    onboard?: boolean;
}

const isRecord = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isValidHarnessModelId = (id: unknown): id is string =>
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 256 &&
    id.trim() === id &&
    !/[\s\p{Cc}]/u.test(id);

const searchConfigHash = () =>
    createHash("sha256")
        .update(
            JSON.stringify({
                provider: "perplexity",
                perplexity: {
                    baseUrl: PROVIDER_BASE_URL,
                    apiKey: KEY_REFERENCE,
                    model: SEARCH_MODEL,
                },
            }),
        )
        .digest("hex");

const parseJsonObject = (path: string, text: string | null): JsonObject => {
    if (text === null || !text.trim()) return {};
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid JSON";
        throw new Error(`Invalid JSON in ${path}: ${detail}`);
    }
    if (!isRecord(value)) throw new Error(`${path} must contain a JSON object`);
    return value;
};

const configuredPath = (
    ctx: HarnessContext,
    variable: string,
): string | null => {
    const value = ctx.env[variable]?.trim();
    return value ? resolveHarnessPath(value, ctx.home) : null;
};

/** OpenClaw's explicit config path wins over its state/home overrides. */
export const openclawConfigPath = (ctx: HarnessContext): string => {
    const explicit = configuredPath(ctx, "OPENCLAW_CONFIG_PATH");
    if (explicit) return explicit;

    const stateDir = configuredPath(ctx, "OPENCLAW_STATE_DIR");
    if (stateDir) return join(stateDir, CONFIG_NAME);

    const openclawHome = configuredPath(ctx, "OPENCLAW_HOME");
    const state = openclawHome
        ? join(openclawHome, ".openclaw")
        : join(ctx.home, ".openclaw");
    return join(state, CONFIG_NAME);
};

const files = (ctx: HarnessContext) => [openclawConfigPath(ctx)];

const readDocuments = (ctx: HarnessContext): JsonObject => {
    const path = openclawConfigPath(ctx);
    const config = parseJsonObject(path, readTextIfExists(path));
    if (config.models !== undefined && !isRecord(config.models)) {
        throw new Error(`${path}.models must be a JSON object`);
    }
    const models = isRecord(config.models) ? config.models : undefined;
    if (models?.providers !== undefined && !isRecord(models.providers)) {
        throw new Error(`${path}.models.providers must be a JSON object`);
    }
    const providers = isRecord(models?.providers)
        ? models.providers
        : undefined;
    if (providers?.[PROVIDER] !== undefined && !isRecord(providers[PROVIDER])) {
        throw new Error(
            `${path}.models.providers.${PROVIDER} must be a JSON object`,
        );
    }
    const provider = isRecord(providers?.[PROVIDER])
        ? providers[PROVIDER]
        : undefined;
    if (provider?.models !== undefined && !Array.isArray(provider.models)) {
        throw new Error(
            `${path}.models.providers.${PROVIDER}.models must be an array`,
        );
    }
    if (provider?.apiKey !== undefined && typeof provider.apiKey !== "string") {
        throw new Error(
            `${path}.models.providers.${PROVIDER}.apiKey must be a string`,
        );
    }
    if (config.env !== undefined && !isRecord(config.env)) {
        throw new Error(`${path}.env must be a JSON object`);
    }
    const env = isRecord(config.env) ? config.env : undefined;
    if (env?.vars !== undefined && !isRecord(env.vars)) {
        throw new Error(`${path}.env.vars must be a JSON object`);
    }
    if (config.tools !== undefined && !isRecord(config.tools)) {
        throw new Error(`${path}.tools must be a JSON object`);
    }
    const tools = isRecord(config.tools) ? config.tools : undefined;
    if (tools?.web !== undefined && !isRecord(tools.web)) {
        throw new Error(`${path}.tools.web must be a JSON object`);
    }
    const web = isRecord(tools?.web) ? tools.web : undefined;
    if (web?.search !== undefined && !isRecord(web.search)) {
        throw new Error(`${path}.tools.web.search must be a JSON object`);
    }
    if (config.agents !== undefined && !isRecord(config.agents)) {
        throw new Error(`${path}.agents must be a JSON object`);
    }
    const agents = isRecord(config.agents) ? config.agents : undefined;
    if (agents?.defaults !== undefined && !isRecord(agents.defaults)) {
        throw new Error(`${path}.agents.defaults must be a JSON object`);
    }
    const defaults = isRecord(agents?.defaults) ? agents.defaults : undefined;
    if (defaults?.model !== undefined && !isRecord(defaults.model)) {
        throw new Error(`${path}.agents.defaults.model must be a JSON object`);
    }
    return config;
};

const readDocumentsForStatus = (ctx: HarnessContext): JsonObject | null => {
    try {
        return readDocuments(ctx);
    } catch {
        return null;
    }
};

const configNeedsOnboarding = (ctx: HarnessContext, config: JsonObject) =>
    readTextIfExists(openclawConfigPath(ctx)) === null ||
    Object.keys(config).length === 0;

const configuredKey = (config: JsonObject): string | null => {
    const env = isRecord(config.env) ? config.env : undefined;
    const vars = isRecord(env?.vars) ? env.vars : undefined;
    const value = vars?.[KEY_ENV];
    return typeof value === "string" && /^sk_[^\s]+$/u.test(value.trim())
        ? value.trim()
        : null;
};

const existingKey = (config: JsonObject): string | null => {
    const models = isRecord(config.models) ? config.models : undefined;
    const providers = isRecord(models?.providers)
        ? models.providers
        : undefined;
    const provider = isRecord(providers?.[PROVIDER])
        ? providers[PROVIDER]
        : undefined;
    if (provider?.apiKey === KEY_REFERENCE) return configuredKey(config);
    if (
        typeof provider?.apiKey === "string" &&
        /^sk_[^\s]+$/u.test(provider.apiKey.trim())
    ) {
        return provider.apiKey.trim();
    }
    return null;
};

const modelConfig = (model: HarnessModel): JsonObject => ({
    id: model.id,
    name: model.id,
    ...(model.reasoning ? { reasoning: true } : {}),
    input: model.input,
    contextWindow: model.contextWindow,
});

const keyAllowsModels = (
    permissions: { models?: string[] | null } | null | undefined,
    modelIds: string[],
) =>
    permissions?.models === null ||
    permissions?.models === undefined ||
    modelIds.every((id) => permissions.models?.includes(id));

const searchModelIsVisible = async (apiKey: string): Promise<boolean> => {
    const { data } = await gen<{ data: unknown[] }>("/v1/models", { apiKey });
    return (
        Array.isArray(data) &&
        data.some((model) => isRecord(model) && model.id === SEARCH_MODEL)
    );
};

const assertOpenclawKeySupportsModels = async (
    apiKey: string,
    primaryModel: string,
) => {
    const info = await inspectHarnessKey(apiKey);
    if (
        !info ||
        !keyAllowsModels(info.permissions, [primaryModel, SEARCH_MODEL])
    ) {
        throw new Error("Pollinations key cannot access the OpenClaw models");
    }
    if (!(await searchModelIsVisible(apiKey))) {
        throw new Error(
            `Pollinations model "${SEARCH_MODEL}" is not available for this key`,
        );
    }
};

const searchConfig = (): JsonObject => ({
    provider: "perplexity",
    perplexity: {
        baseUrl: PROVIDER_BASE_URL,
        apiKey: KEY_REFERENCE,
        model: SEARCH_MODEL,
    },
});

const isCompatibleModelConfig = (value: unknown): value is JsonObject =>
    isRecord(value) &&
    isValidHarnessModelId(value.id) &&
    typeof value.contextWindow === "number" &&
    Number.isFinite(value.contextWindow) &&
    value.contextWindow > 0 &&
    Array.isArray(value.input) &&
    value.input.includes("text") &&
    value.input.every((input) => input === "text" || input === "image");

const selectModel = (requested: string | undefined, models: HarnessModel[]) => {
    if (models.length === 0)
        throw new Error("No compatible Pollinations models were found");
    const selected = requested?.trim();
    if (selected) {
        if (!models.some((model) => model.id === selected)) {
            throw new Error(
                `Model "${requested}" is not a tool-calling text model. Run: polli models`,
            );
        }
        return selected;
    }
    return (
        models.find((model) => model.id === DEFAULT_MODEL)?.id ??
        [...models].sort((a, b) => a.id.localeCompare(b.id))[0].id
    );
};

const buildConfig = (
    current: JsonObject,
    settings: OpenClawConfig,
): JsonObject => {
    const currentModels = isRecord(current.models) ? current.models : {};
    const currentProviders = isRecord(currentModels.providers)
        ? currentModels.providers
        : {};
    const previousProvider = isRecord(currentProviders[PROVIDER])
        ? currentProviders[PROVIDER]
        : {};
    const provider = {
        ...previousProvider,
        baseUrl: PROVIDER_BASE_URL,
        api: "openai-completions",
        apiKey: KEY_REFERENCE,
        models: settings.models.map(modelConfig),
    };
    const currentEnv = isRecord(current.env) ? current.env : {};
    const currentVars = isRecord(currentEnv.vars) ? currentEnv.vars : {};
    const currentAgents = isRecord(current.agents) ? current.agents : {};
    const currentDefaults = isRecord(currentAgents.defaults)
        ? currentAgents.defaults
        : {};
    const currentDefaultModel = isRecord(currentDefaults.model)
        ? currentDefaults.model
        : {};
    const currentTools = isRecord(current.tools) ? current.tools : {};
    const currentWeb = isRecord(currentTools.web) ? currentTools.web : {};
    const currentSearch = isRecord(currentWeb.search) ? currentWeb.search : {};
    return {
        ...current,
        models: {
            ...currentModels,
            mode: "merge",
            providers: { ...currentProviders, [PROVIDER]: provider },
        },
        env: {
            ...currentEnv,
            vars: { ...currentVars, [KEY_ENV]: settings.apiKey },
        },
        agents: {
            ...currentAgents,
            defaults: {
                ...currentDefaults,
                model: {
                    ...currentDefaultModel,
                    primary: `${PROVIDER}/${settings.model}`,
                },
            },
        },
        tools: {
            ...currentTools,
            web: {
                ...currentWeb,
                search: { ...currentSearch, ...searchConfig() },
            },
        },
    };
};

const saveConfig = (ctx: HarnessContext, config: JsonObject) =>
    writeTextAtomic(
        openclawConfigPath(ctx),
        `${JSON.stringify(config, null, 2)}\n`,
        0o600,
    );

const snapshotBefore = (
    snapshot: HarnessSnapshot | null,
    path: string,
): string | null | undefined => snapshot?.files[path]?.before;

const beforeConfig = (
    snapshot: HarnessSnapshot | null,
    path: string,
): JsonObject | null => {
    const before = snapshotBefore(snapshot, path);
    return before === undefined ? null : parseJsonObject(path, before);
};

const stripConfig = (
    ctx: HarnessContext,
    snapshot: HarnessSnapshot | null,
): boolean => {
    const path = openclawConfigPath(ctx);
    const current = readDocuments(ctx);
    const before = beforeConfig(snapshot, path);
    const beforeModels = isRecord(before?.models) ? before.models : undefined;
    const beforeProviders = isRecord(beforeModels?.providers)
        ? beforeModels.providers
        : undefined;
    const beforeProvider = isRecord(beforeProviders?.[PROVIDER])
        ? beforeProviders[PROVIDER]
        : undefined;
    const currentModels = isRecord(current.models) ? { ...current.models } : {};
    const currentProviders = isRecord(currentModels.providers)
        ? { ...currentModels.providers }
        : {};
    const currentProvider = isRecord(currentProviders[PROVIDER])
        ? currentProviders[PROVIDER]
        : undefined;

    if (currentProvider) {
        const restoredProvider = { ...currentProvider };
        for (const key of MANAGED_PROVIDER_KEYS) {
            if (beforeProvider && key in beforeProvider)
                restoredProvider[key] = beforeProvider[key];
            else delete restoredProvider[key];
        }
        if (Object.keys(restoredProvider).length > 0)
            currentProviders[PROVIDER] = restoredProvider;
        else delete currentProviders[PROVIDER];
    }
    if (Object.keys(currentProviders).length > 0 || beforeProviders)
        currentModels.providers = currentProviders;
    else delete currentModels.providers;

    if (beforeModels && "mode" in beforeModels)
        currentModels.mode = beforeModels.mode;
    else delete currentModels.mode;

    const currentTools = isRecord(current.tools) ? { ...current.tools } : {};
    const currentWeb = isRecord(currentTools.web)
        ? { ...currentTools.web }
        : {};
    const currentSearch = isRecord(currentWeb.search)
        ? { ...currentWeb.search }
        : undefined;
    const beforeTools = isRecord(before?.tools) ? before.tools : undefined;
    const beforeWeb = isRecord(beforeTools?.web) ? beforeTools.web : undefined;
    const beforeSearch = isRecord(beforeWeb?.search)
        ? beforeWeb.search
        : undefined;
    if (currentSearch) {
        const restoredSearch = { ...currentSearch };
        for (const key of MANAGED_SEARCH_KEYS) {
            if (beforeSearch && key in beforeSearch)
                restoredSearch[key] = beforeSearch[key];
            else delete restoredSearch[key];
        }
        if (Object.keys(restoredSearch).length > 0)
            currentWeb.search = restoredSearch;
        else delete currentWeb.search;
    }
    if (Object.keys(currentWeb).length > 0 || beforeWeb)
        currentTools.web = currentWeb;
    else delete currentTools.web;

    const currentEnv = isRecord(current.env) ? { ...current.env } : {};
    const currentVars = isRecord(currentEnv.vars) ? { ...currentEnv.vars } : {};
    const beforeEnv = isRecord(before?.env) ? before.env : undefined;
    const beforeVars = isRecord(beforeEnv?.vars) ? beforeEnv.vars : undefined;
    if (beforeVars && KEY_ENV in beforeVars)
        currentVars[KEY_ENV] = beforeVars[KEY_ENV];
    else delete currentVars[KEY_ENV];
    if (Object.keys(currentVars).length > 0 || beforeVars)
        currentEnv.vars = currentVars;
    else delete currentEnv.vars;

    const currentAgents = isRecord(current.agents) ? { ...current.agents } : {};
    const currentDefaults = isRecord(currentAgents.defaults)
        ? { ...currentAgents.defaults }
        : {};
    const currentDefaultModel = isRecord(currentDefaults.model)
        ? { ...currentDefaults.model }
        : {};
    const beforeAgents = isRecord(before?.agents) ? before.agents : undefined;
    const beforeDefaults = isRecord(beforeAgents?.defaults)
        ? beforeAgents.defaults
        : undefined;
    const beforeDefaultModel = isRecord(beforeDefaults?.model)
        ? beforeDefaults.model
        : undefined;
    if (beforeDefaultModel && "primary" in beforeDefaultModel)
        currentDefaultModel.primary = beforeDefaultModel.primary;
    else delete currentDefaultModel.primary;
    if (Object.keys(currentDefaultModel).length > 0 || beforeDefaultModel)
        currentDefaults.model = currentDefaultModel;
    else delete currentDefaults.model;
    if (Object.keys(currentDefaults).length > 0 || beforeDefaults)
        currentAgents.defaults = currentDefaults;
    else delete currentAgents.defaults;

    const next = { ...current };
    if (Object.keys(currentModels).length > 0 || beforeModels)
        next.models = currentModels;
    else delete next.models;
    if (Object.keys(currentEnv).length > 0 || beforeEnv) next.env = currentEnv;
    else delete next.env;
    if (Object.keys(currentAgents).length > 0 || beforeAgents)
        next.agents = currentAgents;
    else delete next.agents;
    if (Object.keys(currentTools).length > 0 || beforeTools)
        next.tools = currentTools;
    else delete next.tools;
    if (JSON.stringify(next) === JSON.stringify(current)) return false;
    saveConfig(ctx, next);
    return true;
};

const localStatus = (ctx: HarnessContext): HarnessResult => {
    const path = openclawConfigPath(ctx);
    const config = readDocumentsForStatus(ctx);
    let model: string | undefined;
    let configured = false;
    if (config) {
        const models = isRecord(config.models) ? config.models : undefined;
        const providers = isRecord(models?.providers)
            ? models.providers
            : undefined;
        const provider = isRecord(providers?.[PROVIDER])
            ? providers[PROVIDER]
            : undefined;
        const agents = isRecord(config.agents) ? config.agents : undefined;
        const defaults = isRecord(agents?.defaults)
            ? agents.defaults
            : undefined;
        const defaultModel = isRecord(defaults?.model)
            ? defaults.model
            : undefined;
        const primary = defaultModel?.primary;
        model =
            typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)
                ? primary.slice(PROVIDER.length + 1)
                : undefined;
        const providerModels = Array.isArray(provider?.models)
            ? provider.models
            : [];
        const tools = isRecord(config.tools) ? config.tools : undefined;
        const web = isRecord(tools?.web) ? tools.web : undefined;
        const search = isRecord(web?.search) ? web.search : undefined;
        const perplexity = isRecord(search?.perplexity)
            ? search.perplexity
            : undefined;
        configured =
            provider?.baseUrl === PROVIDER_BASE_URL &&
            provider.api === "openai-completions" &&
            provider.apiKey === KEY_REFERENCE &&
            configuredKey(config) !== null &&
            models?.mode === "merge" &&
            typeof primary === "string" &&
            primary.startsWith(`${PROVIDER}/`) &&
            providerModels.length > 0 &&
            providerModels.every(isCompatibleModelConfig) &&
            providerModels.some((entry) => entry.id === model) &&
            search?.provider === "perplexity" &&
            perplexity?.baseUrl === PROVIDER_BASE_URL &&
            perplexity.apiKey === KEY_REFERENCE &&
            perplexity.model === SEARCH_MODEL;
    }
    return { harness: ID, label: LABEL, configured, model, files: [path] };
};

const liveStatus = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const structural = localStatus(ctx);
    if (!structural.configured || !structural.model) return structural;
    const config = readDocumentsForStatus(ctx);
    if (!config) return { ...structural, configured: false };
    const key = configuredKey(config);
    if (!key) return { ...structural, configured: false };
    try {
        const info = await inspectHarnessKey(key);
        if (!info) return { ...structural, configured: false };
        if (
            !keyAllowsModels(info.permissions, [structural.model, SEARCH_MODEL])
        ) {
            return { ...structural, configured: false };
        }
        const models = await fetchHarnessModels(key);
        return models.some((candidate) => candidate.id === structural.model) &&
            (await searchModelIsVisible(key))
            ? structural
            : { ...structural, configured: false };
    } catch {
        return { ...structural, configured: false };
    }
};

const preflight = (ctx: HarnessContext) => {
    const path = openclawConfigPath(ctx);
    const managedFiles = files(ctx);
    const snapshotPath = harnessSnapshotPath(ctx, ID, managedFiles);
    for (const target of [path, snapshotPath]) {
        if (existsSync(target) && !statSync(target).isFile()) {
            throw new Error(`Managed path is not a regular file: ${target}`);
        }
        let parent = dirname(target);
        while (!existsSync(parent)) {
            const next = dirname(parent);
            if (next === parent) break;
            parent = next;
        }
        if (existsSync(parent) && !statSync(parent).isDirectory()) {
            throw new Error(
                `Managed path parent is not a directory: ${parent}`,
            );
        }
        try {
            accessSync(parent, constants.W_OK);
        } catch {
            throw new Error(`Managed path parent is not writable: ${parent}`);
        }
        if (existsSync(target)) {
            try {
                accessSync(target, constants.W_OK);
            } catch {
                throw new Error(`Managed path is not writable: ${target}`);
            }
        }
    }
    const snapshot = loadHarnessSnapshot(ctx, ID, managedFiles);
    if (snapshot) {
        if (!Object.hasOwn(snapshot.files, path)) {
            throw new Error(`Invalid harness snapshot ${snapshotPath}`);
        }
    }
    readDocuments(ctx);
};

const openclawCommand = (ctx: HarnessContext): string | null => {
    const path = ctx.env.PATH;
    if (!path) return null;
    const candidates =
        process.platform === "win32"
            ? ["openclaw.exe", "openclaw.cmd", "openclaw"]
            : ["openclaw"];
    for (const directory of path.split(delimiter)) {
        for (const command of candidates) {
            const candidate = join(directory, command);
            try {
                if (!statSync(candidate).isFile()) continue;
                if (process.platform !== "win32")
                    accessSync(candidate, constants.X_OK);
                return candidate;
            } catch {}
        }
    }
    return null;
};

const quoteWindowsArg = (value: string): string => {
    if (!/[\s"&|<>^]/u.test(value)) return value;
    return `"${value.replace(/([\\]*)"/gu, '$1$1\\"').replace(/(\\+)$/u, "$1$1")}"`;
};

export const isOpenclawInstalled = (ctx: HarnessContext) =>
    openclawCommand(ctx) !== null;

export const runOpenclawOnboarding = (ctx: HarnessContext): void => {
    const command = openclawCommand(ctx);
    if (!command) throw new Error("OpenClaw is not installed");
    const isWindowsWrapper =
        process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const executable = isWindowsWrapper
        ? process.env.ComSpec || "cmd.exe"
        : command;
    const args = isWindowsWrapper
        ? ["/d", "/c", command, ...ONBOARD_ARGS.map(quoteWindowsArg)]
        : ONBOARD_ARGS;
    const result = spawnSync(executable, args, {
        cwd: ctx.home,
        env: { ...process.env, ...ctx.env },
        stdio: ["ignore", "ignore", "ignore"],
    });
    if (result.error || result.status !== 0)
        throw new Error("OpenClaw onboarding failed");
};

export const configureOpenclaw = (
    ctx: HarnessContext,
    settings: OpenClawConfig,
): HarnessResult => {
    preflight(ctx);
    const apiKey = normalizeSecretKey(settings.apiKey);
    if (!apiKey) throw new Error("A Pollinations secret API key is required");
    const model = selectModel(settings.model, settings.models);
    const current = readDocuments(ctx);
    const onboard = settings.onboard && configNeedsOnboarding(ctx, current);
    if (onboard && !isOpenclawInstalled(ctx))
        throw new Error("OpenClaw is not installed");
    applyWithSnapshot(
        ctx,
        ID,
        files(ctx),
        () => {
            if (onboard) runOpenclawOnboarding(ctx);
            const base = onboard ? readDocuments(ctx) : current;
            saveConfig(ctx, buildConfig(base, { ...settings, apiKey, model }));
        },
        undefined,
        (existing) => ({
            ...existing,
            openclaw: {
                provider: true,
                defaultModel: model,
                modelsMode: true,
                keyEnv: KEY_ENV,
                webSearch: true,
                webSearchHash: searchConfigHash(),
            },
        }),
    );
    const result = localStatus(ctx);
    if (result.configured) return result;
    try {
        disableOpenclaw(ctx);
    } catch (rollbackError) {
        throw new AggregateError(
            [
                new Error(
                    "OpenClaw setup did not produce a configured harness",
                ),
                rollbackError,
            ],
            "OpenClaw setup failed and its config could not be restored",
        );
    }
    throw new Error("OpenClaw setup did not produce a configured harness");
};

export const disableOpenclaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    const snapshot = loadHarnessSnapshot(ctx, ID, managedFiles);
    const restoration = restoreSnapshot(ctx, ID, managedFiles);
    if (restoration === "restored")
        return { ...localStatus(ctx), configured: false, outcome: "restored" };
    if (restoration === "missing")
        return { ...localStatus(ctx), configured: false, outcome: "unchanged" };
    const changed = stripConfig(ctx, snapshot);
    clearSnapshot(ctx, ID, managedFiles);
    return {
        ...localStatus(ctx),
        configured: false,
        outcome: changed ? "stripped" : "unchanged",
    };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw as a Pollinations provider",
    supportsMcp: false,
    restartHint:
        "Restart OpenClaw or its gateway for the new provider to take effect.",
    async on(ctx, options) {
        if (!isOpenclawInstalled(ctx)) {
            throw new Error(
                "OpenClaw is not installed. Install it first: https://openclaw.ai/install",
            );
        }
        preflight(ctx);
        const publicModels = await fetchHarnessModels("");
        selectModel(options.model, publicModels);
        const config = readDocuments(ctx);
        const onboard = configNeedsOnboarding(ctx, config);
        const lease = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: existingKey(config) },
            {
                browser: options.browser,
                beforeCreate: async (accountKey) => {
                    const keyedModels = await fetchHarnessModels(accountKey);
                    const model = selectModel(options.model, keyedModels);
                    await assertOpenclawKeySupportsModels(accountKey, model);
                },
            },
        );
        return withHarnessKeyLease(lease, async (apiKey) => {
            const models = await fetchHarnessModels(apiKey);
            const model = selectModel(options.model, models);
            await assertOpenclawKeySupportsModels(apiKey, model);
            return configureOpenclaw(ctx, {
                apiKey,
                model,
                models,
                onboard,
            });
        });
    },
    off: disableOpenclaw,
    status: liveStatus,
};
