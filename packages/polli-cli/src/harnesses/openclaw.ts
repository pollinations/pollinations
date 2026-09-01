import { join } from "node:path";
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

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";
const MAX_TOKENS = 8192;
const INSTALL_HINT = "curl -fsSL https://openclaw.ai/install.sh | bash";

/**
 * OpenClaw keeps state in OPENCLAW_STATE_DIR (default ~/.openclaw) and reads
 * its main config from openclaw.json there. `models.providers` merges with the
 * built-in catalog by default, so no `models.mode` override is written.
 */
export const openclawStateDir = (ctx: HarnessContext) =>
    ctx.env.OPENCLAW_STATE_DIR?.trim() || join(ctx.home, ".openclaw");
const configPath = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "openclaw.json");
const skillPath = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

interface ProviderEntry {
    baseUrl?: string;
    api?: string;
    apiKey?: string;
}

interface OpenClawConfig {
    models?: { providers?: Record<string, unknown> } & Record<string, unknown>;
    agents?: {
        defaults?: {
            model?: { primary?: string } & Record<string, unknown>;
        } & Record<string, unknown>;
    };
    [key: string]: unknown;
}

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const saveJson = (path: string, data: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
};

const loadConfig = (path: string): OpenClawConfig =>
    loadJson(path) as OpenClawConfig;

const modelEntry = (model: HarnessModel) => ({
    id: model.id,
    name: model.id,
    reasoning: false,
    input: model.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: MAX_TOKENS,
});

const providerEntry = (models: HarnessModel[], apiKey: string) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey,
    api: "openai-completions",
    models: models.map(modelEntry),
});

const readKey = (ctx: HarnessContext): string | null => {
    const provider = loadConfig(configPath(ctx)).models?.providers?.[
        PROVIDER
    ] as ProviderEntry | undefined;
    return typeof provider?.apiKey === "string" && provider.apiKey
        ? provider.apiKey
        : null;
};

const primaryModel = (config: OpenClawConfig) =>
    config.agents?.defaults?.model?.primary;

const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    const config = loadConfig(configPath(ctx));
    config.models = {
        ...(config.models ?? {}),
        providers: {
            ...((config.models?.providers as Record<string, unknown>) ?? {}),
            [PROVIDER]: providerEntry(models, apiKey),
        },
    };

    // OpenClaw treats an existing primary as intentional, so a non-Pollinations
    // default is kept and only reported (docs/concepts/model-providers.md).
    let switched = true;
    const primary = primaryModel(config);
    if (primary === undefined || primary.startsWith(`${PROVIDER}/`)) {
        config.agents = {
            ...(config.agents ?? {}),
            defaults: {
                ...((config.agents?.defaults as Record<string, unknown>) ?? {}),
                model: {
                    ...((config.agents?.defaults?.model as
                        | Record<string, unknown>
                        | undefined) ?? {}),
                    primary: `${PROVIDER}/${model}`,
                },
            },
        };
    } else if (primary !== `${PROVIDER}/${model}`) {
        switched = false;
    }
    saveJson(configPath(ctx), config);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
    if (!switched) {
        printInfo(
            `Kept your existing default model. Switch with: openclaw models set ${PROVIDER}/${model}`,
        );
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;
    if (readTextIfExists(configPath(ctx)) !== null) {
        const config = loadConfig(configPath(ctx));
        const providers = config.models?.providers as
            | Record<string, unknown>
            | undefined;
        if (providers && PROVIDER in providers) {
            const rest = { ...providers };
            delete rest[PROVIDER];
            if (Object.keys(rest).length === 0) delete config.models;
            else config.models = { ...config.models, providers: rest };
            changed = true;
        }
        if (primaryModel(config)?.startsWith(`${PROVIDER}/`)) {
            delete config.agents?.defaults?.model?.primary;
            changed = true;
        }
        if (changed) saveJson(configPath(ctx), config);
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = loadConfig(configPath(ctx));
    const provider = config.models?.providers?.[PROVIDER] as
        | ProviderEntry
        | undefined;
    const primary = primaryModel(config);
    const model = primary?.startsWith(`${PROVIDER}/`)
        ? primary.slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            typeof provider?.apiKey === "string" &&
            provider.apiKey.length > 0 &&
            readTextIfExists(skillPath(ctx)) !== null,
        model,
        files: files(ctx),
    };
};

export const configureOpenclaw = (
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

export const disableOpenclaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a model provider in OpenClaw",
    restartHint: "Restart OpenClaw or run: openclaw gateway restart",

    async on(ctx, options) {
        if (!commandExists("openclaw", ctx.env)) {
            throw new Error(
                `OpenClaw was not found. Install it first: ${INSTALL_HINT}`,
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
        return configureOpenclaw(ctx, models, apiKey, model);
    },

    off: disableOpenclaw,
    status: result,
};
