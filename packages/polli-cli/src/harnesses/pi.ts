import { join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
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
const INSTALL_CMD =
    "npm install -g --ignore-scripts @earendil-works/pi-coding-agent";

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
const settingsPath = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "settings.json");
// Pi auto-discovers SKILL.md files from ~/.pi/agent/skills/ subdirectories.
const skillFile = (ctx: HarnessContext) =>
    join(piAgentDir(ctx), "skills", "polli", "SKILL.md");

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

// Provider block in the models.json schema Pi shares with Prime Agent. The
// apiKey is stored literally (models.json supports literal API keys) and the
// compat flags match what gen.pollinations.ai/v1 accepts.
const providerEntry = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    api: "openai-completions",
    apiKey: "",
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
    // models.json: merge providers.pollinations, preserving the rest.
    const modelsData = loadJson(modelsPath(ctx));
    const providers =
        (modelsData.providers as Record<string, unknown> | undefined) ?? {};
    modelsData.providers = {
        ...providers,
        [PROVIDER]: {
            ...providerEntry(settings.models),
            apiKey: settings.apiKey,
        },
    };
    saveJson(modelsPath(ctx), modelsData);

    // settings.json: set startup provider/model defaults, preserving the rest.
    const piSettings = loadJson(settingsPath(ctx));
    piSettings.defaultProvider = PROVIDER;
    piSettings.defaultModel = settings.model;
    saveJson(settingsPath(ctx), piSettings);

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

export const configurePi = (
    ctx: HarnessContext,
    settings: PiSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
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
    description: "Configure Pi as a Pollinations provider",
    restartHint:
        "Changes apply on the next Pi session. Start Pi with: pi\nNot installed? Run: npm install -g --ignore-scripts @earendil-works/pi-coding-agent",

    async on(ctx, options) {
        if (!commandExists("pi")) {
            printInfo(
                `Pi is not installed. Install it with:\n  ${INSTALL_CMD}\nOr see https://github.com/earendil-works/pi for other options.`,
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
        return configurePi(ctx, { apiKey, model, models });
    },

    off: disablePi,
    status: result,
};
