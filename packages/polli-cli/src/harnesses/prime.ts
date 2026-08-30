import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import {
    inspectHarnessKey,
    isSecretHarnessKey,
    normalizeSecretKey,
    resolveHarnessKey,
    withHarnessKeyLease,
} from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    type HarnessSnapshot,
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

const ID = "prime";
const LABEL = "Prime Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";
const INSTALL_GUIDANCE =
    process.platform === "win32"
        ? "Install Prime Agent with the official Windows installer: https://app.primeintellect.ai/prime-agent/install"
        : "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh";
const PRIME_AGENT_DIR_ENV = "PRIME_AGENT_CODING_AGENT_DIR";
const PROVIDER_BASE_URL = `${BASE_URL}/v1`;
const PRIME_COMMANDS =
    process.platform === "win32"
        ? ["prime-agent.exe", "prime-agent.cmd", "prime-agent"]
        : ["prime-agent"];

const REQUIRED_COMPAT = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
} as const;
const MANAGED_PROVIDER_KEYS = new Set([
    "baseUrl",
    "api",
    "apiKey",
    "compat",
    "models",
]);

const managedProvider = (provider: JsonObject): JsonObject =>
    Object.fromEntries(
        [...MANAGED_PROVIDER_KEYS]
            .filter((key) => key in provider)
            .map((key) => [key, provider[key]]),
    );

type JsonObject = Record<string, unknown>;

interface PrimeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

interface PreparedConfig {
    models: JsonObject;
    settings: JsonObject;
}

const isRecord = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (path: string, text: string | null): JsonObject => {
    if (text === null) return {};

    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error(`${path} is not valid JSON — fix it before running on`);
    }
    if (!isRecord(value)) {
        throw new Error(
            `${path} must contain a JSON object — fix it before running on`,
        );
    }
    return value;
};

const validateModelEntry = (path: string, value: unknown) => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
        throw new Error(`${path} contains an invalid model entry`);
    }
    if (
        value.contextWindow !== undefined &&
        (typeof value.contextWindow !== "number" ||
            !Number.isFinite(value.contextWindow) ||
            value.contextWindow <= 0)
    ) {
        throw new Error(`${path} contains an invalid model contextWindow`);
    }
    if (
        value.input !== undefined &&
        (!Array.isArray(value.input) ||
            !value.input.includes("text") ||
            value.input.some((input) => input !== "text" && input !== "image"))
    ) {
        throw new Error(`${path} contains invalid model input modalities`);
    }
};

const validateModelsDocument = (path: string, document: JsonObject) => {
    const providers = document.providers;
    if (providers === undefined) return;
    if (!isRecord(providers)) {
        throw new Error(`${path}.providers must be a JSON object`);
    }

    const provider = providers[PROVIDER];
    if (provider !== undefined && !isRecord(provider)) {
        throw new Error(`${path}.providers.${PROVIDER} must be a JSON object`);
    }
    if (!isRecord(provider) || provider.models === undefined) return;
    if (!Array.isArray(provider.models)) {
        throw new Error(
            `${path}.providers.${PROVIDER}.models must be an array`,
        );
    }
    const ids = new Set<string>();
    for (const model of provider.models) {
        validateModelEntry(`${path}.providers.${PROVIDER}.models`, model);
        const id = (model as JsonObject).id as string;
        if (ids.has(id)) {
            throw new Error(
                `${path}.providers.${PROVIDER}.models contains duplicate model "${id}"`,
            );
        }
        ids.add(id);
    }
};

const readDocuments = (ctx: HarnessContext): PreparedConfig => {
    const models = parseJsonObject(
        modelsPath(ctx),
        readTextIfExists(modelsPath(ctx)),
    );
    validateModelsDocument(modelsPath(ctx), models);
    const settings = parseJsonObject(
        settingsPath(ctx),
        readTextIfExists(settingsPath(ctx)),
    );
    return { models, settings };
};

const configuredCredential = (
    ctx: HarnessContext,
    provider: JsonObject | undefined,
): string | null => {
    const configured = provider?.apiKey;
    if (typeof configured !== "string" || !configured.trim()) return null;
    const direct = normalizeSecretKey(configured);
    if (direct) return direct;
    const environmentValue = ctx.env[configured.trim()];
    return normalizeSecretKey(environmentValue);
};

const readExistingKey = (ctx: HarnessContext): string | null => {
    let document: JsonObject;
    try {
        document = readDocuments(ctx).models;
    } catch {
        return null;
    }
    const providers = isRecord(document.providers)
        ? document.providers
        : undefined;
    const provider = providers?.[PROVIDER];
    return isRecord(provider) ? configuredCredential(ctx, provider) : null;
};

const modelConfig = (model: HarnessModel): JsonObject => ({
    id: model.id,
    name: model.id,
    contextWindow: model.contextWindow,
    input: model.input,
});

const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const isCompatibleModel = (model: JsonObject) =>
    typeof model.contextWindow === "number" &&
    Number.isFinite(model.contextWindow) &&
    model.contextWindow > 0 &&
    Array.isArray(model.input) &&
    model.input.includes("text") &&
    model.input.every((input) => input === "text" || input === "image");

const providerConfig = (
    previous: JsonObject | undefined,
    apiKey: string,
    models: HarnessModel[],
    selectedModel: string,
): JsonObject => {
    const previousModels = Array.isArray(previous?.models)
        ? (previous.models as JsonObject[])
        : [];
    const liveIds = new Set(models.map((model) => model.id));
    const liveConfigs = models.map(modelConfig);
    const preservedModels = previousModels.filter(
        (model) => typeof model.id === "string" && !liveIds.has(model.id),
    );
    const orderedModels = [
        ...liveConfigs.filter((model) => model.id === selectedModel),
        ...liveConfigs.filter((model) => model.id !== selectedModel),
        ...preservedModels,
    ];
    const previousCompat = isRecord(previous?.compat)
        ? previous.compat
        : undefined;

    return {
        ...(previous ?? {}),
        baseUrl: PROVIDER_BASE_URL,
        api: "openai-completions",
        apiKey,
        compat: { ...(previousCompat ?? {}), ...REQUIRED_COMPAT },
        models: orderedModels,
    };
};

const prepareConfig = (
    ctx: HarnessContext,
    settings: PrimeSettings,
): PreparedConfig => {
    const apiKey = normalizeSecretKey(settings.apiKey);
    if (!apiKey) throw new Error("A Pollinations secret API key is required");
    if (!settings.model.trim())
        throw new Error("A Prime Agent model is required");
    if (settings.models.length === 0) {
        throw new Error("No compatible Pollinations models were found");
    }
    const modelIds = new Set<string>();
    for (const model of settings.models) {
        try {
            const entry = modelConfig(model);
            validateModelEntry("Pollinations models", entry);
            if (!isCompatibleModel(entry)) {
                throw new Error("missing text compatibility");
            }
        } catch {
            throw new Error("Pollinations models contain an invalid model");
        }
        if (modelIds.has(model.id)) {
            throw new Error(
                "Pollinations models contain an invalid or duplicate id",
            );
        }
        modelIds.add(model.id);
    }
    if (!modelIds.has(settings.model)) {
        throw new Error(
            `Model "${settings.model}" is not available in Pollinations`,
        );
    }

    const current = readDocuments(ctx);
    const currentProviders = isRecord(current.models.providers)
        ? current.models.providers
        : {};
    const models = {
        ...current.models,
        providers: {
            ...currentProviders,
            [PROVIDER]: providerConfig(
                isRecord(currentProviders[PROVIDER])
                    ? currentProviders[PROVIDER]
                    : undefined,
                apiKey,
                settings.models,
                settings.model,
            ),
        },
    };
    const nextSettings = {
        ...current.settings,
        defaultProvider: PROVIDER,
        defaultModel: settings.model,
    };
    return { models, settings: nextSettings };
};

const writeConfig = (ctx: HarnessContext, prepared: PreparedConfig) => {
    writeTextAtomic(
        modelsPath(ctx),
        `${JSON.stringify(prepared.models, null, 2)}\n`,
        0o600,
    );
    writeTextAtomic(
        settingsPath(ctx),
        `${JSON.stringify(prepared.settings, null, 2)}\n`,
        0o600,
    );
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const restoreConfigTransaction = (
    originals: Map<string, string | null>,
    snapshotPath: string,
    previousSnapshot: string | null,
) => {
    const errors: unknown[] = [];
    try {
        for (const [path, original] of originals) {
            if (original === null) removeIfExists(path);
            else writeTextAtomic(path, original, 0o600);
        }
    } catch (error) {
        errors.push(error);
    }
    try {
        if (previousSnapshot === null) removeIfExists(snapshotPath);
        else writeTextAtomic(snapshotPath, previousSnapshot, 0o600);
    } catch (error) {
        errors.push(error);
    }
    if (errors.length > 0) {
        throw new AggregateError(
            errors,
            "Prime Agent configuration failed and could not be rolled back",
        );
    }
};

const hasValidCredential = (ctx: HarnessContext, provider: JsonObject) => {
    const key = configuredCredential(ctx, provider);
    return isSecretHarnessKey(key);
};

const hasValidModels = (provider: JsonObject, selectedModel: string) => {
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
        return false;
    }
    const models = provider.models as JsonObject[];
    const selected = models.find((model) => model.id === selectedModel);
    return (
        selected !== undefined &&
        isCompatibleModel(selected) &&
        models.every((model) => {
            try {
                validateModelEntry("provider.models", model);
                return true;
            } catch {
                return false;
            }
        })
    );
};

const hasRequiredCompat = (provider: JsonObject) => {
    const compat = provider.compat;
    if (!isRecord(compat)) return false;
    return Object.entries(REQUIRED_COMPAT).every(
        ([key, value]) => compat[key] === value,
    );
};

const localStatus = (ctx: HarnessContext): HarnessResult => {
    let configured = false;
    let model: string | undefined;
    try {
        const { models, settings } = readDocuments(ctx);
        const providers = isRecord(models.providers) ? models.providers : {};
        const provider = providers[PROVIDER];
        model =
            typeof settings.defaultModel === "string"
                ? settings.defaultModel
                : undefined;
        configured =
            isRecord(provider) &&
            provider.api === "openai-completions" &&
            provider.baseUrl === PROVIDER_BASE_URL &&
            hasValidCredential(ctx, provider) &&
            hasRequiredCompat(provider) &&
            typeof settings.defaultProvider === "string" &&
            settings.defaultProvider === PROVIDER &&
            typeof settings.defaultModel === "string" &&
            hasValidModels(provider, settings.defaultModel) &&
            readTextIfExists(skillPath(ctx)) === polliSkill;
    } catch {
        configured = false;
    }

    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        files: files(ctx),
    };
};

const status = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const result = localStatus(ctx);
    if (!result.configured) return result;
    try {
        const { models } = readDocuments(ctx);
        const providers = models.providers as JsonObject;
        const provider = providers[PROVIDER] as JsonObject;
        const key = configuredCredential(ctx, provider);
        if (!isSecretHarnessKey(key)) return { ...result, configured: false };
        const keyInfo = await inspectHarnessKey(key);
        if (!keyInfo) return { ...result, configured: false };
        const allowedModels = (
            keyInfo as { permissions?: { models?: unknown } }
        ).permissions?.models;
        if (
            Array.isArray(allowedModels) &&
            typeof result.model === "string" &&
            !allowedModels.includes(result.model)
        ) {
            return { ...result, configured: false };
        }
        const liveModels = await fetchHarnessModels(key);
        if (
            typeof result.model !== "string" ||
            !liveModels.some((model) => model.id === result.model)
        ) {
            return { ...result, configured: false };
        }
    } catch {
        return { ...result, configured: false };
    }
    return result;
};

const snapshotBefore = (
    snapshot: HarnessSnapshot | null,
    path: string,
): JsonObject | null => {
    const before = snapshot?.files[path]?.before;
    if (before === undefined || before === null) return null;
    return parseJsonObject(path, before);
};

const writeChangedFiles = (
    changes: Array<{ path: string; text?: string }>,
    originals: Map<string, string | null>,
) => {
    try {
        for (const change of changes) {
            if (change.text === undefined) removeIfExists(change.path);
            else writeTextAtomic(change.path, change.text, 0o600);
        }
    } catch (error) {
        try {
            for (const [path, original] of originals) {
                if (original === null) removeIfExists(path);
                else writeTextAtomic(path, original, 0o600);
            }
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Prime Agent configuration cleanup failed and could not be restored",
            );
        }
        throw error;
    }
};

const restoreProvider = (
    current: JsonObject,
    before: JsonObject,
): JsonObject => {
    const restored: JsonObject = {};
    for (const [key, value] of Object.entries(before)) {
        if (MANAGED_PROVIDER_KEYS.has(key)) restored[key] = value;
        else if (key in current) restored[key] = current[key];
    }
    for (const [key, value] of Object.entries(current)) {
        if (!MANAGED_PROVIDER_KEYS.has(key) && !(key in restored)) {
            restored[key] = value;
        }
    }
    return restored;
};

const stripConfig = (
    ctx: HarnessContext,
    snapshot: HarnessSnapshot,
): boolean => {
    const current = readDocuments(ctx);
    const beforeModels = snapshotBefore(snapshot, modelsPath(ctx));
    const beforeSettings = snapshotBefore(snapshot, settingsPath(ctx));
    const beforeSkill = snapshot.files[skillPath(ctx)]?.before ?? null;
    const ownership =
        snapshot.metadata && isRecord(snapshot.metadata.prime)
            ? snapshot.metadata.prime
            : null;
    const changes: Array<{ path: string; text?: string }> = [];

    const currentProviders = isRecord(current.models.providers)
        ? { ...current.models.providers }
        : {};
    const beforeProviders = isRecord(beforeModels?.providers)
        ? beforeModels.providers
        : {};
    const currentProvider = currentProviders[PROVIDER];
    const providerIsOwned =
        isRecord(currentProvider) &&
        ownership?.providerHash ===
            hash(JSON.stringify(managedProvider(currentProvider)));
    if (providerIsOwned) {
        if (PROVIDER in beforeProviders) {
            const beforeProvider = beforeProviders[PROVIDER];
            if (isRecord(currentProvider) && isRecord(beforeProvider)) {
                currentProviders[PROVIDER] = restoreProvider(
                    currentProvider,
                    beforeProvider,
                );
            } else {
                currentProviders[PROVIDER] = beforeProvider;
            }
        } else {
            // A provider created by this adapter may have acquired user-owned
            // fields after setup. Remove only the managed fields and retain
            // those additions; delete the provider only when nothing remains.
            const preserved = Object.fromEntries(
                Object.entries(currentProvider).filter(
                    ([key]) => !MANAGED_PROVIDER_KEYS.has(key),
                ),
            );
            if (Object.keys(preserved).length > 0)
                currentProviders[PROVIDER] = preserved;
            else delete currentProviders[PROVIDER];
        }
    }
    const nextModels = { ...current.models };
    const hadProvidersBefore = isRecord(beforeModels?.providers);
    if (Object.keys(currentProviders).length > 0 || hadProvidersBefore) {
        nextModels.providers = currentProviders;
    } else {
        delete nextModels.providers;
    }
    if (JSON.stringify(nextModels) !== JSON.stringify(current.models)) {
        changes.push({
            path: modelsPath(ctx),
            text: `${JSON.stringify(nextModels, null, 2)}\n`,
        });
    }

    const nextSettings = { ...current.settings };
    const defaultsAreManaged =
        ownership?.defaultProvider === PROVIDER &&
        ownership.defaultModel === current.settings.defaultModel &&
        current.settings.defaultProvider === PROVIDER;
    if (defaultsAreManaged) {
        if (beforeSettings && "defaultProvider" in beforeSettings) {
            nextSettings.defaultProvider = beforeSettings.defaultProvider;
        } else {
            delete nextSettings.defaultProvider;
        }
        if (beforeSettings && "defaultModel" in beforeSettings) {
            nextSettings.defaultModel = beforeSettings.defaultModel;
        } else {
            delete nextSettings.defaultModel;
        }
    }
    if (JSON.stringify(nextSettings) !== JSON.stringify(current.settings)) {
        changes.push({
            path: settingsPath(ctx),
            text: `${JSON.stringify(nextSettings, null, 2)}\n`,
        });
    }

    const skill = readTextIfExists(skillPath(ctx));
    if (beforeSkill === null && skill === polliSkill) {
        changes.push({ path: skillPath(ctx) });
    }
    if (changes.length === 0) return false;

    const originals = new Map(
        files(ctx).map((path) => [path, readTextIfExists(path)] as const),
    );
    writeChangedFiles(changes, originals);
    return true;
};

export const primeHome = (ctx: HarnessContext): string => {
    const configured = ctx.env[PRIME_AGENT_DIR_ENV];
    if (!configured?.trim()) return join(ctx.home, ".prime", "agent");
    if (configured === "~") return ctx.home;
    if (configured.startsWith("~/") || configured.startsWith("~\\")) {
        return join(ctx.home, configured.slice(2));
    }
    return resolve(configured);
};

const modelsPath = (ctx: HarnessContext) => join(primeHome(ctx), "models.json");
const settingsPath = (ctx: HarnessContext) =>
    join(primeHome(ctx), "settings.json");
const skillPath = (ctx: HarnessContext) =>
    join(primeHome(ctx), "skills", "polli", "SKILL.md");
const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
    settingsPath(ctx),
    skillPath(ctx),
];

const commandInstalled = (ctx: HarnessContext) => {
    const path = ctx.env.PATH;
    if (!path) return false;
    return path.split(delimiter).some((directory) =>
        PRIME_COMMANDS.some((command) => {
            const candidate = join(directory, command);
            try {
                if (!statSync(candidate).isFile()) return false;
                if (process.platform !== "win32")
                    accessSync(candidate, constants.X_OK);
                return true;
            } catch {
                return false;
            }
        }),
    );
};

export const isPrimeInstalled = (ctx: HarnessContext) => commandInstalled(ctx);

const preflightPrime = (ctx: HarnessContext) => {
    const managedFiles = files(ctx);
    const snapshotPath = harnessSnapshotPath(ctx, ID, managedFiles);
    loadHarnessSnapshot(ctx, ID, managedFiles);
    for (const target of [...managedFiles, snapshotPath]) {
        if (existsSync(target) && !statSync(target).isFile()) {
            if (target === snapshotPath) {
                throw new Error("Harness snapshot path is not writable");
            }
            throw new Error(`Managed path is not a regular file: ${target}`);
        }
        let parent = dirname(target);
        while (!existsSync(parent)) {
            const next = dirname(parent);
            if (next === parent) break;
            parent = next;
        }
        if (!existsSync(parent) || !statSync(parent).isDirectory()) {
            throw new Error(
                `Managed path parent is not a directory: ${parent}`,
            );
        }
        try {
            accessSync(parent, constants.W_OK);
        } catch {
            throw new Error(`Managed path is not writable: ${target}`);
        }
    }
    readDocuments(ctx);
    const existingSkill = readTextIfExists(skillPath(ctx));
    if (existingSkill !== null && existingSkill !== polliSkill) {
        throw new Error(
            `${skillPath(ctx)} already exists and is not managed by Pollinations; move it before connecting Prime Agent`,
        );
    }
};

export const configurePrime = (
    ctx: HarnessContext,
    settings: PrimeSettings,
): HarnessResult => {
    preflightPrime(ctx);
    const managedFiles = files(ctx);
    const snapshotPath = harnessSnapshotPath(ctx, ID, managedFiles);
    const originals = new Map(
        managedFiles.map((path) => [path, readTextIfExists(path)] as const),
    );
    const previousSnapshot = readTextIfExists(snapshotPath);
    const prepared = prepareConfig(ctx, settings);
    const provider = (prepared.models.providers as JsonObject)[PROVIDER];
    applyWithSnapshot(
        ctx,
        ID,
        files(ctx),
        () => writeConfig(ctx, prepared),
        undefined,
        (existing) => ({
            ...existing,
            prime: {
                providerHash: hash(
                    JSON.stringify(managedProvider(provider as JsonObject)),
                ),
                defaultProvider: PROVIDER,
                defaultModel: settings.model,
            },
        }),
    );
    const result = localStatus(ctx);
    if (!result.configured) {
        restoreConfigTransaction(originals, snapshotPath, previousSnapshot);
        throw new Error("Prime Agent configuration failed local validation");
    }
    return result;
};

export const disablePrime = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    const restoration = restoreSnapshot(ctx, ID, managedFiles);
    if (restoration === "restored") {
        return { ...localStatus(ctx), configured: false, outcome: "restored" };
    }
    if (restoration === "missing") {
        return { ...localStatus(ctx), configured: false, outcome: "unchanged" };
    }

    const snapshot = loadHarnessSnapshot(ctx, ID, managedFiles);
    if (!snapshot) {
        return { ...localStatus(ctx), configured: false, outcome: "unchanged" };
    }
    const changed = stripConfig(ctx, snapshot);
    clearSnapshot(ctx, ID, managedFiles);
    return {
        ...localStatus(ctx),
        configured: false,
        outcome: changed ? "stripped" : "unchanged",
    };
};

export const prime: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Prime Agent as a Pollinations provider",
    restartHint:
        "Changes apply on the next Prime Agent session. Start it with: prime-agent",

    async on(ctx, options) {
        if (!isPrimeInstalled(ctx)) {
            throw new Error(
                `Prime Agent is not installed. ${INSTALL_GUIDANCE}`,
            );
        }

        // Parse and inspect every existing file before fetching a catalog/key
        // or creating a snapshot, so user-owned config cannot be overwritten.
        preflightPrime(ctx);
        const model = options.model?.trim() || DEFAULT_MODEL;
        const publicModels = (await fetchHarnessModels()).filter(
            (candidate) => {
                try {
                    const entry = modelConfig(candidate);
                    validateModelEntry("Pollinations models", entry);
                    return isCompatibleModel(entry);
                } catch {
                    return false;
                }
            },
        );
        if (!publicModels.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const lease = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readExistingKey(ctx) },
            {
                browser: options.browser,
                beforeCreate: async (accountKey) => {
                    const keyedModels = (
                        await fetchHarnessModels(accountKey)
                    ).filter((candidate) => {
                        try {
                            const entry = modelConfig(candidate);
                            validateModelEntry("Pollinations models", entry);
                            return isCompatibleModel(entry);
                        } catch {
                            return false;
                        }
                    });
                    if (
                        !keyedModels.some((candidate) => candidate.id === model)
                    ) {
                        throw new Error(
                            `Model "${model}" is not available for this Pollinations key`,
                        );
                    }
                },
            },
        );
        return withHarnessKeyLease(lease, async (apiKey) => {
            // Model visibility can be narrower for a child harness key than
            // for the public catalog. Configure only from the key-scoped
            // listing.
            const models = (await fetchHarnessModels(apiKey)).filter(
                (candidate) => {
                    try {
                        const entry = modelConfig(candidate);
                        validateModelEntry("Pollinations models", entry);
                        return isCompatibleModel(entry);
                    } catch {
                        return false;
                    }
                },
            );
            if (!models.some((candidate) => candidate.id === model)) {
                throw new Error(
                    `Model "${model}" is not available for this Pollinations key`,
                );
            }
            return configurePrime(ctx, { apiKey, model, models });
        });
    },

    off: disablePrime,
    status,
};
