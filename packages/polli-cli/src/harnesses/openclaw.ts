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

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";

const configPath = (ctx: HarnessContext) =>
    join(ctx.home, ".openclaw", "openclaw.json");
const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, ".openclaw", "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text) return {};
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const readKey = (ctx: HarnessContext): string | null => {
    const config = loadJson(configPath(ctx));
    try {
        const key = (
            (config.models as Record<string, unknown>)?.providers as Record<
                string,
                unknown
            >
        )?.[PROVIDER] as Record<string, unknown> | undefined;
        const apiKey = key?.apiKey;
        return typeof apiKey === "string" && apiKey ? apiKey : null;
    } catch {
        return null;
    }
};

const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey,
    api: "openai-completions",
    models: models.map((m) => ({
        id: m.id,
        name: m.id,
        reasoning: false,
        input: m.input,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: 8192,
    })),
});

interface OpenclawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: OpenclawSettings) => {
    const config = loadJson(configPath(ctx));
    if (!config.models || typeof config.models !== "object") {
        config.models = {};
    }
    const modelsSection = config.models as Record<string, unknown>;
    if (
        !modelsSection.providers ||
        typeof modelsSection.providers !== "object"
    ) {
        modelsSection.providers = {};
    }
    const providers = modelsSection.providers as Record<string, unknown>;
    providers[PROVIDER] = providerConfig(settings.models, settings.apiKey);
    modelsSection.mode = "merge";
    modelsSection.defaultModel = `${PROVIDER}/${settings.model}`;
    const text = `${JSON.stringify(config, null, 2)}\n`;
    writeTextAtomic(configPath(ctx), text, 0o600);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) {
        let changed = false;
        if (readTextIfExists(skillPath(ctx)) === polliSkill) {
            removeIfExists(skillPath(ctx));
            changed = true;
        }
        return changed;
    }
    let config: Record<string, unknown>;
    try {
        config = JSON.parse(text) as Record<string, unknown>;
    } catch {
        return false;
    }
    let changed = false;
    const modelsSection = config.models as Record<string, unknown> | undefined;
    if (modelsSection) {
        const providers = modelsSection.providers as
            | Record<string, unknown>
            | undefined;
        if (providers && PROVIDER in providers) {
            delete providers[PROVIDER];
            changed = true;
        }
        if (modelsSection.mode === "merge") {
            delete modelsSection.mode;
            changed = true;
        }
        const defaultModel = modelsSection.defaultModel;
        if (
            typeof defaultModel === "string" &&
            defaultModel.startsWith(`${PROVIDER}/`)
        ) {
            delete modelsSection.defaultModel;
            changed = true;
        }
    }
    if (changed) {
        writeTextAtomic(
            configPath(ctx),
            `${JSON.stringify(config, null, 2)}\n`,
            0o600,
        );
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = loadJson(configPath(ctx));
    const modelsSection = config.models as Record<string, unknown> | undefined;
    const providers = modelsSection?.providers as
        | Record<string, unknown>
        | undefined;
    const provider = providers?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const defaultModel = modelsSection?.defaultModel;
    const model =
        typeof defaultModel === "string" &&
        defaultModel.startsWith(`${PROVIDER}/`)
            ? defaultModel.slice(PROVIDER.length + 1)
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model,
        files: files(ctx),
    };
};

export const configureOpenclaw = (
    ctx: HarnessContext,
    settings: OpenclawSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
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
    description: "Configure OpenClaw as a Pollinations provider",
    restartHint:
        "Run `openclaw gateway restart` for the new provider to take effect.",

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
        return configureOpenclaw(ctx, { apiKey, model, models });
    },

    off: disableOpenclaw,
    status: result,
};
