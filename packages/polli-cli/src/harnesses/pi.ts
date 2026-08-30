import { execFileSync } from "node:child_process";
import { createHash, scryptSync } from "node:crypto";
import { join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import {
    isHarnessKeyValid,
    normalizeSecretKey,
    resolveHarnessKey,
    withHarnessKeyLease,
} from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    loadHarnessSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "pi";
const LABEL = "Pi";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";
const PROVIDER_BASE_URL = `${BASE_URL}/v1`;
const PI_INSTALL_COMMAND =
    "npm install -g --ignore-scripts @earendil-works/pi-coding-agent";
const PI_COMMAND_CANDIDATES = ["pi.cmd", "pi.exe", "pi"] as const;

type JsonObject = Record<string, unknown>;

export interface PiConfig {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

interface PiDocuments {
    models: JsonObject;
    auth: JsonObject;
    settings: JsonObject;
}

const isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (path: string, text: string | null): JsonObject => {
    if (text === null) return {};

    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid JSON";
        throw new Error(`Invalid JSON in ${path}: ${detail}`);
    }

    if (!isJsonObject(value)) {
        throw new Error(`${path} must contain a JSON object`);
    }
    return value;
};

const readDocuments = (ctx: HarnessContext): PiDocuments => {
    const documents = {
        models: parseJsonObject(
            modelsPath(ctx),
            readTextIfExists(modelsPath(ctx)),
        ),
        auth: parseJsonObject(authPath(ctx), readTextIfExists(authPath(ctx))),
        settings: parseJsonObject(
            settingsPath(ctx),
            readTextIfExists(settingsPath(ctx)),
        ),
    };

    if (
        documents.models.providers !== undefined &&
        !isJsonObject(documents.models.providers)
    ) {
        throw new Error(`${modelsPath(ctx)}.providers must be a JSON object`);
    }

    return documents;
};

const readDocumentsForStatus = (ctx: HarnessContext): PiDocuments | null => {
    try {
        return readDocuments(ctx);
    } catch {
        return null;
    }
};

export const piAgentDir = (ctx: HarnessContext): string => {
    const configured = ctx.env.PI_CODING_AGENT_DIR;
    if (!configured?.trim()) return join(ctx.home, ".pi", "agent");

    const expanded =
        configured === "~"
            ? ctx.home
            : configured.startsWith("~/") || configured.startsWith("~\\")
              ? join(ctx.home, configured.slice(2))
              : configured;
    return resolve(expanded);
};

const modelsPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "models.json");
const authPath = (ctx: HarnessContext) => join(piAgentDir(ctx), "auth.json");
const settingsPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "settings.json");
const skillPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "skills", "polli", "SKILL.md");

const assertSkillAvailable = (ctx: HarnessContext) => {
    const existing = readTextIfExists(skillPath(ctx));
    if (existing !== null && existing !== polliSkill) {
        throw new Error(
            `Pi skill path is already owned by another skill: ${skillPath(ctx)}`,
        );
    }
};

const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
    authPath(ctx),
    settingsPath(ctx),
    skillPath(ctx),
];

const saveJson = (path: string, data: JsonObject) =>
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);

const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: PROVIDER_BASE_URL,
    api: "openai-completions",
    compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
        supportsStrictMode: false,
        maxTokensField: "max_tokens",
    },
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        ...(model.reasoning ? { reasoning: true } : {}),
        contextWindow: model.contextWindow,
        input: model.input,
    })),
});

const readKey = (auth: JsonObject): string | null => {
    const entry = auth[PROVIDER];
    if (!isJsonObject(entry) || entry.type !== "api_key") return null;
    return normalizeSecretKey(entry.key);
};

const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");

// Keep the ownership fingerprint deterministic while making API-key guesses
// expensive if the local metadata is exposed.
const hashSecret = (value: string) =>
    scryptSync(value, "polli-pi-auth-v1", 32, {
        N: 16384,
        r: 8,
        p: 1,
    }).toString("hex");

const managedMetadata = (settings: PiConfig) => ({
    pi: {
        providerHash: hash(JSON.stringify(providerConfig(settings.models))),
        authHash: hashSecret(
            JSON.stringify({ type: "api_key", key: settings.apiKey.trim() }),
        ),
        defaultProvider: PROVIDER,
        defaultModel: settings.model,
    },
});

const selectModel = (
    requested: string | undefined,
    models: HarnessModel[],
): string => {
    if (models.length === 0) {
        throw new Error("No compatible tool-calling text models are available");
    }

    if (requested !== undefined) {
        const model = requested.trim();
        if (!model || !models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${requested}" is not a tool-calling text model. Run: polli models`,
            );
        }
        return model;
    }

    const preferred = models.find((model) => model.id === DEFAULT_MODEL);
    if (preferred) return preferred.id;

    return [...models].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )[0].id;
};

const validateConfig = (settings: PiConfig) => {
    if (!settings.apiKey?.trim()) {
        throw new Error("A Pollinations API key is required for Pi");
    }
    if (
        !settings.model ||
        !settings.models.some(({ id }) => id === settings.model)
    ) {
        throw new Error(
            `Model "${settings.model}" is not a tool-calling text model. Run: polli models`,
        );
    }
};

const writeConfig = (
    ctx: HarnessContext,
    documents: PiDocuments,
    settings: PiConfig,
) => {
    const existingProviders = isJsonObject(documents.models.providers)
        ? documents.models.providers
        : {};
    saveJson(modelsPath(ctx), {
        ...documents.models,
        providers: {
            ...existingProviders,
            [PROVIDER]: providerConfig(settings.models),
        },
    });

    saveJson(authPath(ctx), {
        ...documents.auth,
        [PROVIDER]: { type: "api_key", key: settings.apiKey },
    });

    saveJson(settingsPath(ctx), {
        ...documents.settings,
        defaultProvider: PROVIDER,
        defaultModel: settings.model,
    });

    // Pi auto-discovers SKILL.md files below the official agent directory.
    // Never replace an existing skill, even if it belongs to another tool.
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const providerModels = (provider: JsonObject): JsonObject[] | null => {
    if (!Array.isArray(provider.models)) return null;
    if (
        !provider.models.every(
            (model) =>
                isJsonObject(model) &&
                typeof model.id === "string" &&
                model.id.trim() !== "" &&
                typeof model.contextWindow === "number" &&
                Number.isFinite(model.contextWindow) &&
                model.contextWindow > 0 &&
                Array.isArray(model.input) &&
                model.input.length > 0 &&
                model.input.every((modality) => typeof modality === "string"),
        )
    ) {
        return null;
    }
    return provider.models;
};

const structuralResult = (ctx: HarnessContext): HarnessResult => {
    const documents = readDocumentsForStatus(ctx);
    const base = {
        harness: ID,
        label: LABEL,
        model: undefined as string | undefined,
        files: files(ctx),
    };
    if (!documents) return { ...base, configured: false };

    const providers = isJsonObject(documents.models.providers)
        ? documents.models.providers
        : null;
    const provider =
        providers && isJsonObject(providers[PROVIDER])
            ? providers[PROVIDER]
            : null;
    const models = provider ? providerModels(provider) : null;
    const model =
        typeof documents.settings.defaultModel === "string" &&
        documents.settings.defaultModel.trim()
            ? documents.settings.defaultModel
            : undefined;
    const authKey = readKey(documents.auth);

    const exactProvider =
        provider?.api === "openai-completions" &&
        provider.baseUrl === PROVIDER_BASE_URL &&
        models !== null &&
        models.length > 0;
    const selectedModel =
        model && models?.some((candidate) => candidate.id === model);

    return {
        ...base,
        configured:
            exactProvider === true &&
            selectedModel === true &&
            documents.settings.defaultProvider === PROVIDER &&
            authKey !== null &&
            readTextIfExists(skillPath(ctx)) === polliSkill,
        model,
    };
};

const liveStatus = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const structural = structuralResult(ctx);
    if (!structural.configured) return structural;

    const documents = readDocumentsForStatus(ctx);
    if (!documents) return { ...structural, configured: false };

    const key = readKey(documents.auth);
    const model = structural.model;
    if (!key || !model) return { ...structural, configured: false };

    try {
        if (!(await isHarnessKeyValid(key))) {
            return { ...structural, configured: false };
        }

        const models = await fetchHarnessModels(key);
        return {
            ...structural,
            configured: models.some((candidate) => candidate.id === model),
        };
    } catch {
        // Status should report not-ready when the live checks cannot be
        // completed; it must never claim readiness from local truthiness.
        return { ...structural, configured: false };
    }
};

const snapshotBefore = (
    snapshot: ReturnType<typeof loadHarnessSnapshot>,
    path: string,
): string | null | undefined => snapshot?.files[path]?.before;

const parseSnapshotObject = (
    path: string,
    text: string | null | undefined,
): JsonObject | null => {
    if (text === undefined) return null;
    return parseJsonObject(path, text);
};

interface FileChange {
    path: string;
    text: string | null;
}

const applyFileChanges = (changes: FileChange[]) => {
    const originals = new Map(
        changes.map(({ path }) => [path, readTextIfExists(path)]),
    );
    try {
        for (const change of changes) {
            if (change.text === null) removeIfExists(change.path);
            else writeTextAtomic(change.path, change.text);
        }
    } catch (error) {
        try {
            for (const [path, text] of originals) {
                if (text === null) removeIfExists(path);
                else writeTextAtomic(path, text);
            }
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Pi cleanup failed and its config could not be restored",
            );
        }
        throw error;
    }
};

const jsonChanged = (before: JsonObject, after: JsonObject) =>
    JSON.stringify(before) !== JSON.stringify(after);

const stripConfig = (
    ctx: HarnessContext,
    snapshot: ReturnType<typeof loadHarnessSnapshot>,
): boolean => {
    // Parse every current file before writing any cleanup change. This keeps
    // an edited-but-invalid file from leaving the other files half-cleaned.
    const documents = readDocuments(ctx);
    const changes: FileChange[] = [];

    const currentModels = {
        ...documents.models,
        ...(isJsonObject(documents.models.providers)
            ? { providers: { ...documents.models.providers } }
            : {}),
    };
    const currentProviders = isJsonObject(currentModels.providers)
        ? currentModels.providers
        : null;
    const beforeModels = parseSnapshotObject(
        modelsPath(ctx),
        snapshotBefore(snapshot, modelsPath(ctx)),
    );
    const beforeProviders =
        beforeModels && isJsonObject(beforeModels.providers)
            ? beforeModels.providers
            : null;
    const ownership =
        snapshot?.metadata && isJsonObject(snapshot.metadata.pi)
            ? snapshot.metadata.pi
            : null;
    const providerIsOwned =
        currentProviders && Object.hasOwn(currentProviders, PROVIDER)
            ? ownership?.providerHash ===
              hash(JSON.stringify(currentProviders[PROVIDER]))
            : false;
    if (currentProviders && providerIsOwned) {
        if (beforeProviders && Object.hasOwn(beforeProviders, PROVIDER)) {
            currentProviders[PROVIDER] = beforeProviders[PROVIDER];
        } else {
            delete currentProviders[PROVIDER];
        }
    }
    if (currentProviders && jsonChanged(documents.models, currentModels)) {
        changes.push({
            path: modelsPath(ctx),
            text: `${JSON.stringify(currentModels, null, 2)}\n`,
        });
    }

    const currentAuth = { ...documents.auth };
    const beforeAuth = parseSnapshotObject(
        authPath(ctx),
        snapshotBefore(snapshot, authPath(ctx)),
    );
    const authIsOwned =
        Object.hasOwn(currentAuth, PROVIDER) &&
        ownership?.authHash ===
            hashSecret(JSON.stringify(currentAuth[PROVIDER]));
    if (authIsOwned) {
        if (beforeAuth && Object.hasOwn(beforeAuth, PROVIDER)) {
            currentAuth[PROVIDER] = beforeAuth[PROVIDER];
        } else {
            delete currentAuth[PROVIDER];
        }
    }
    if (jsonChanged(documents.auth, currentAuth)) {
        changes.push({
            path: authPath(ctx),
            text: `${JSON.stringify(currentAuth, null, 2)}\n`,
        });
    }

    const currentSettings = { ...documents.settings };
    const beforeSettings = parseSnapshotObject(
        settingsPath(ctx),
        snapshotBefore(snapshot, settingsPath(ctx)),
    );
    const defaultsAreOwned =
        ownership?.defaultProvider === PROVIDER &&
        ownership.defaultModel === currentSettings.defaultModel &&
        currentSettings.defaultProvider === PROVIDER;
    if (defaultsAreOwned) {
        if (
            beforeSettings &&
            Object.hasOwn(beforeSettings, "defaultProvider")
        ) {
            currentSettings.defaultProvider = beforeSettings.defaultProvider;
        } else {
            delete currentSettings.defaultProvider;
        }
        if (beforeSettings && Object.hasOwn(beforeSettings, "defaultModel")) {
            currentSettings.defaultModel = beforeSettings.defaultModel;
        } else {
            delete currentSettings.defaultModel;
        }
    }
    if (jsonChanged(documents.settings, currentSettings)) {
        changes.push({
            path: settingsPath(ctx),
            text: `${JSON.stringify(currentSettings, null, 2)}\n`,
        });
    }

    const currentSkill = readTextIfExists(skillPath(ctx));
    const beforeSkill = snapshotBefore(snapshot, skillPath(ctx));
    if (currentSkill === polliSkill && beforeSkill === null) {
        changes.push({ path: skillPath(ctx), text: null });
    } else if (
        currentSkill === polliSkill &&
        beforeSkill !== undefined &&
        beforeSkill !== null
    ) {
        changes.push({ path: skillPath(ctx), text: beforeSkill });
    }

    // Keep changes to the official files transactional even when a later
    // rename/delete fails.
    applyFileChanges(changes);
    return changes.length > 0;
};

export const configurePi = (
    ctx: HarnessContext,
    settings: PiConfig,
): HarnessResult => {
    // This preflight is deliberately before snapshot creation and before any
    // key/network work performed by `on`.
    const documents = readDocuments(ctx);
    assertSkillAvailable(ctx);
    const apiKey = normalizeSecretKey(settings.apiKey);
    if (!apiKey)
        throw new Error("A Pollinations secret API key is required for Pi");
    const normalizedSettings = {
        ...settings,
        apiKey,
    };
    validateConfig(normalizedSettings);
    applyWithSnapshot(
        ctx,
        ID,
        files(ctx),
        () => writeConfig(ctx, documents, normalizedSettings),
        undefined,
        (existing) => ({
            ...existing,
            pi: managedMetadata(normalizedSettings).pi,
        }),
    );
    const result = structuralResult(ctx);
    if (result.configured) return result;

    // A successful write that does not produce an exactly ready adapter is a
    // failed setup. Restore the transactional snapshot before surfacing the
    // failure so a created key lease can safely be revoked by the caller.
    try {
        disablePi(ctx);
    } catch (rollbackError) {
        throw new AggregateError(
            [
                new Error("Pi setup did not produce a configured harness"),
                rollbackError,
            ],
            "Pi setup failed and its config could not be restored",
        );
    }
    throw new Error("Pi setup did not produce a configured harness");
};

export const disablePi = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    const snapshot = loadHarnessSnapshot(ctx, ID, managedFiles);
    const restore = restoreSnapshot(ctx, ID, managedFiles);

    if (restore === "restored") {
        return {
            ...structuralResult(ctx),
            configured: false,
            outcome: "restored",
        };
    }

    const changed = stripConfig(ctx, snapshot);
    clearSnapshot(ctx, ID, managedFiles);
    return {
        ...structuralResult(ctx),
        configured: false,
        outcome: changed ? "stripped" : "unchanged",
    };
};

const piInstalled = () => {
    const candidates =
        process.platform === "win32"
            ? PI_COMMAND_CANDIDATES
            : (["pi"] as const);
    for (const command of candidates) {
        try {
            execFileSync(command, ["--version"], {
                stdio: "ignore",
                ...(process.platform === "win32" ? { shell: true } : {}),
            });
            return true;
        } catch {
            // Try the next platform-specific command name.
        }
    }
    printInfo(
        `Pi is not installed. Install the official coding agent with:\n  ${PI_INSTALL_COMMAND}`,
    );
    return false;
};

export const pi: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Pi as a Pollinations provider",
    supportsMcp: false,
    restartHint:
        "Changes apply on the next Pi session. Start Pi with: pi\nNot installed? npm install -g --ignore-scripts @earendil-works/pi-coding-agent",

    async on(ctx, options) {
        // A user-owned skill must stop setup before catalog, login, or key
        // requests. It is never overwritten or silently adopted.
        const documents = readDocuments(ctx);
        assertSkillAvailable(ctx);
        if (!piInstalled()) {
            return {
                harness: ID,
                label: LABEL,
                configured: false,
                files: files(ctx),
            };
        }
        const existingKey = readKey(documents.auth);
        if (existingKey && (await isHarnessKeyValid(existingKey))) {
            const models = await fetchHarnessModels(existingKey);
            const model = selectModel(options.model, models);
            return configurePi(ctx, { apiKey: existingKey, model, models });
        }
        const requestedModels = await fetchHarnessModels();
        selectModel(options.model, requestedModels);
        const lease = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(documents.auth) },
            {
                browser: options.browser,
                beforeCreate: async (accountKey) => {
                    const keyedModels = await fetchHarnessModels(accountKey);
                    selectModel(options.model, keyedModels);
                },
            },
        );
        return withHarnessKeyLease(lease, async (apiKey) => {
            const models = await fetchHarnessModels(apiKey);
            const model = selectModel(options.model, models);
            return configurePi(ctx, { apiKey, model, models });
        });
    },

    off: disablePi,
    status: liveStatus,
};
