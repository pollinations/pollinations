import { join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import { readJsonIfExists, writeJsonAtomic } from "./json-config.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
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
const MAX_TOKENS = 16384;

/**
 * Pi resolves its agent dir from PI_CODING_AGENT_DIR, tilde included.
 */
export const piAgentDir = (ctx: HarnessContext) => {
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

const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
    authPath(ctx),
    settingsPath(ctx),
    skillPath(ctx),
];

// Compat flags shared with the dsh provider block: gen.pollinations.ai/v1
// speaks standard completions without store/developer-role/strict-mode extras.
const compat = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

const providerEntry = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    api: "openai-completions",
    compat,
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        reasoning: false,
        input: model.input,
        contextWindow: model.contextWindow,
        maxTokens: MAX_TOKENS,
    })),
});

interface PiModels {
    providers?: Record<string, unknown>;
    [key: string]: unknown;
}

type PiAuth = Record<string, { type?: string; key?: string }>;

interface PiSettings {
    defaultProvider?: string;
    defaultModel?: string;
    [key: string]: unknown;
}

const readKey = (ctx: HarnessContext) => {
    const auth = readJsonIfExists<PiAuth>(authPath(ctx));
    const credential = auth?.[PROVIDER];
    return credential?.type === "api_key" && credential.key
        ? credential.key
        : null;
};

const writeAuth = (ctx: HarnessContext, apiKey: string) => {
    const auth = readJsonIfExists<PiAuth>(authPath(ctx)) ?? {};
    auth[PROVIDER] = { type: "api_key", key: apiKey };
    writeJsonAtomic(authPath(ctx), auth);
};

const deleteAuth = (ctx: HarnessContext) => {
    const auth = readJsonIfExists<PiAuth>(authPath(ctx));
    if (!auth || !(PROVIDER in auth)) return false;
    delete auth[PROVIDER];
    if (Object.keys(auth).length === 0) removeIfExists(authPath(ctx));
    else writeJsonAtomic(authPath(ctx), auth);
    return true;
};

const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    const doc = readJsonIfExists<PiModels>(modelsPath(ctx)) ?? {};
    const providers = (doc.providers ?? {}) as Record<string, unknown>;
    providers[PROVIDER] = providerEntry(models);
    doc.providers = providers;
    writeJsonAtomic(modelsPath(ctx), doc);
    writeAuth(ctx, apiKey);

    const settings = readJsonIfExists<PiSettings>(settingsPath(ctx)) ?? {};
    settings.defaultProvider = PROVIDER;
    settings.defaultModel = model;
    writeJsonAtomic(settingsPath(ctx), settings);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = false;
    const doc = readJsonIfExists<PiModels>(modelsPath(ctx));
    if (doc?.providers && PROVIDER in doc.providers) {
        delete doc.providers[PROVIDER];
        if (Object.keys(doc.providers).length === 0) delete doc.providers;
        writeJsonAtomic(modelsPath(ctx), doc);
        changed = true;
    }
    changed = deleteAuth(ctx) || changed;

    const settings = readJsonIfExists<PiSettings>(settingsPath(ctx));
    if (settings && settings.defaultProvider === PROVIDER) {
        delete settings.defaultProvider;
        delete settings.defaultModel;
        writeJsonAtomic(settingsPath(ctx), settings);
        changed = true;
    }

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = readJsonIfExists<PiModels>(modelsPath(ctx));
    const provider = doc?.providers?.[PROVIDER] as
        | { baseUrl?: string; api?: string }
        | undefined;
    const settings = readJsonIfExists<PiSettings>(settingsPath(ctx));
    const model =
        settings?.defaultProvider === PROVIDER
            ? settings.defaultModel
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configurePi = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, models, apiKey, model),
    );
    return result(ctx);
};

export const disablePi = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const pi: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a custom provider in Pi",
    restartHint:
        "Models reload when you open /model. Start Pi with: npx @earendil-works/pi-coding-agent",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configurePi(ctx, models, apiKey, model);
    },

    off: disablePi,
    status: result,
};
