import { existsSync } from "node:fs";
import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
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

const ID = "prime";
const LABEL = "Prime Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";
const INSTALL_CMD =
    "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh";

export const primeAgentDir = (ctx: HarnessContext): string =>
    join(ctx.home, ".prime", "agent");

const modelsPath = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "models.json");
const settingsPath = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "settings.json");
// Prime Agent auto-discovers SKILL.md files from ~/.prime/agent/skills/.
const skillFile = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
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
    const text = readTextIfExists(modelsPath(ctx));
    if (!text) return null;
    try {
        const doc = JSON.parse(text) as {
            providers?: Record<string, { apiKey?: unknown }>;
        };
        const key = doc.providers?.[PROVIDER]?.apiKey;
        return typeof key === "string" && key.length > 0 ? key : null;
    } catch {
        return null;
    }
};

// Provider block in the models.json schema Prime Agent shares with Pi. The
// apiKey is stored literally (models.json supports literal API keys).
const providerEntry = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    api: "openai-completions",
    apiKey: "",
    compat: {
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

interface PrimeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: PrimeSettings) => {
    const existing = loadJson(modelsPath(ctx));
    const providers =
        (existing.providers as Record<string, unknown> | undefined) ?? {};
    existing.providers = {
        ...providers,
        [PROVIDER]: {
            ...providerEntry(settings.models),
            apiKey: settings.apiKey,
        },
    };
    saveJson(modelsPath(ctx), existing);

    // Settings: pick Pollinations as the startup provider/model. Preserves
    // memories, sessions, and unrelated settings — the config files are
    // merged, never rewritten.
    const agentSettings = loadJson(settingsPath(ctx));
    agentSettings.defaultProvider = PROVIDER;
    agentSettings.defaultModel = settings.model;
    saveJson(settingsPath(ctx), agentSettings);

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
    let configured = false;
    let model: string | undefined;
    const text = readTextIfExists(modelsPath(ctx));
    if (text) {
        try {
            const doc = JSON.parse(text) as {
                providers?: Record<
                    string,
                    {
                        api?: string;
                        baseUrl?: string;
                        apiKey?: string;
                        models?: Array<{ id: string }>;
                    }
                >;
            };
            const provider = doc.providers?.[PROVIDER];
            const settings = loadJson(settingsPath(ctx));
            const defaultModel =
                typeof settings.defaultModel === "string"
                    ? settings.defaultModel
                    : undefined;
            configured =
                provider?.api === "openai-completions" &&
                provider?.baseUrl === `${BASE_URL}/v1` &&
                typeof provider?.apiKey === "string" &&
                provider.apiKey.length > 0 &&
                settings.defaultProvider === PROVIDER &&
                defaultModel !== undefined &&
                readTextIfExists(skillFile(ctx)) !== null;
            model = defaultModel ?? provider?.models?.[0]?.id;
        } catch {
            // Corrupt JSON is not configured.
        }
    }
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        files: files(ctx),
    };
};

export const configurePrime = (
    ctx: HarnessContext,
    settings: PrimeSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disablePrime = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const prime: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Prime Agent as a Pollinations provider",
    restartHint:
        "Changes apply on the next Prime Agent session. Start it with: prime-agent\nNot installed? Run: curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",

    async on(ctx, options) {
        if (!existsSync(join(ctx.home, ".prime"))) {
            throw new Error(
                `Prime Agent is not installed.\nInstall it with: ${INSTALL_CMD}\nOr see https://github.com/PrimeIntellect-ai/prime-agent for other options.`,
            );
        }

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
        return configurePrime(ctx, { apiKey, model, models });
    },

    off: disablePrime,
    status: result,
};
