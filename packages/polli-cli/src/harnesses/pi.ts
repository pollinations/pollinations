import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
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

const ID = "pi";
const LABEL = "Pi";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";

export const piAgentDir = (ctx: HarnessContext): string => {
    const configured = ctx.env.PI_CODING_AGENT_DIR;
    if (!configured?.trim()) return join(ctx.home, ".pi", "agent");
    return resolveHomePath(ctx.home, configured);
};

const modelsPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "models.json");
const authPath = (ctx: HarnessContext) => join(piAgentDir(ctx), "auth.json");
const settingsPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "settings.json");
// Pi auto-discovers SKILL.md files from ~/.pi/agent/skills/ subdirectories.
const skillFile = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
    authPath(ctx),
    settingsPath(ctx),
    skillFile(ctx),
];

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const saveJson = (path: string, data: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
};

const readKey = (ctx: HarnessContext): string | null => {
    const auth = loadJson(authPath(ctx));
    const entry = auth[PROVIDER];
    if (!entry || typeof entry !== "object") return null;
    const key = (entry as Record<string, unknown>).key;
    return typeof key === "string" && key ? key : null;
};

const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    api: "openai-completions",
    // Pi validates custom providers before resolving their auth.json entry.
    apiKey: PROVIDER,
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
        contextWindow: model.contextWindow,
        input: model.input,
    })),
});

interface PiSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: PiSettings) => {
    // models.json: merge providers.pollinations (preserve existing providers)
    const modelsData = loadJson(modelsPath(ctx));
    const providers =
        (modelsData.providers as Record<string, unknown> | undefined) ?? {};
    modelsData.providers = {
        ...providers,
        [PROVIDER]: providerConfig(settings.models),
    };
    saveJson(modelsPath(ctx), modelsData);

    // auth.json: store API key under the provider name
    const auth = loadJson(authPath(ctx));
    auth[PROVIDER] = { type: "api_key", key: settings.apiKey };
    saveJson(authPath(ctx), auth);

    // settings.json: set startup defaults (preserve other settings)
    const piSettings = loadJson(settingsPath(ctx));
    piSettings.defaultProvider = PROVIDER;
    piSettings.defaultModel = settings.model;
    saveJson(settingsPath(ctx), piSettings);

    // skill file — Pi auto-discovers SKILL.md files under ~/.pi/agent/skills/
    if (readTextIfExists(skillFile(ctx)) === null) {
        writeTextAtomic(skillFile(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;

    const modelsText = readTextIfExists(modelsPath(ctx));
    if (modelsText?.trim()) {
        const data = JSON.parse(modelsText) as Record<string, unknown>;
        if (
            data.providers &&
            typeof data.providers === "object" &&
            PROVIDER in (data.providers as Record<string, unknown>)
        ) {
            delete (data.providers as Record<string, unknown>)[PROVIDER];
            saveJson(modelsPath(ctx), data);
            changed = true;
        }
    }

    const authText = readTextIfExists(authPath(ctx));
    if (authText?.trim()) {
        const data = JSON.parse(authText) as Record<string, unknown>;
        if (PROVIDER in data) {
            delete data[PROVIDER];
            saveJson(authPath(ctx), data);
            changed = true;
        }
    }

    const settingsText = readTextIfExists(settingsPath(ctx));
    if (settingsText?.trim()) {
        const data = JSON.parse(settingsText) as Record<string, unknown>;
        if (data.defaultProvider === PROVIDER) {
            delete data.defaultProvider;
            delete data.defaultModel;
            saveJson(settingsPath(ctx), data);
            changed = true;
        }
    }

    if (readTextIfExists(skillFile(ctx)) === polliSkill) {
        removeIfExists(skillFile(ctx));
        changed = true;
    }

    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const modelsData = loadJson(modelsPath(ctx));
    const authData = loadJson(authPath(ctx));
    const settingsData = loadJson(settingsPath(ctx));

    const providers = modelsData.providers as
        | Record<string, unknown>
        | undefined;
    const provider = providers?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const hasProvider = provider?.apiKey === PROVIDER;

    const authEntry = authData[PROVIDER] as Record<string, unknown> | undefined;
    const hasKey =
        authEntry?.type === "api_key" &&
        typeof authEntry.key === "string" &&
        !!authEntry.key;

    const hasDefaultProvider = settingsData.defaultProvider === PROVIDER;
    const model =
        typeof settingsData.defaultModel === "string"
            ? settingsData.defaultModel
            : undefined;

    return {
        harness: ID,
        label: LABEL,
        configured:
            hasProvider &&
            hasKey &&
            hasDefaultProvider &&
            readTextIfExists(skillFile(ctx)) !== null,
        model,
        files: files(ctx),
    };
};

export const configurePi = (
    ctx: HarnessContext,
    settings: PiSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disablePi = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const pi: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Pi as a Pollinations provider",
    restartHint: "Changes apply on the next Pi session. Start Pi with: pi",

    async on(ctx, options) {
        if (!commandExists("pi", ctx.env)) {
            throw new Error(
                "Pi was not found. Install it first: npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configurePi(ctx, { apiKey, model, models });
    },

    off: disablePi,
    status: result,
};
