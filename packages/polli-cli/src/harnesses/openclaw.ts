import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import {
    isInstalled,
    readJsonIfExists,
    writeJsonAtomic,
} from "./json-config.js";
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
const DEFAULT_MODEL = "deepseek";
const MAX_TOKENS = 8192;

/**
 * OpenClaw keeps state in OPENCLAW_STATE_DIR (default ~/.openclaw) and reads
 * its main config from openclaw.json there.
 */
export const openclawStateDir = (ctx: HarnessContext) =>
    ctx.env.OPENCLAW_STATE_DIR?.trim() || join(ctx.home, ".openclaw");
const configPath = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "openclaw.json");
const skillPath = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

interface OpenClawConfig {
    models?: { providers?: Record<string, unknown> } & Record<string, unknown>;
    agents?: {
        defaults?: {
            model?: { primary?: string } & Record<string, unknown>;
        } & Record<string, unknown>;
    };
    [key: string]: unknown;
}

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

const readKey = (ctx: HarnessContext) => {
    const provider = readJsonIfExists<OpenClawConfig>(configPath(ctx))?.models
        ?.providers?.[PROVIDER] as { apiKey?: string } | undefined;
    return provider?.apiKey ?? null;
};

const primaryModel = (config: OpenClawConfig) =>
    config.agents?.defaults?.model?.primary;

const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    const config = readJsonIfExists<OpenClawConfig>(configPath(ctx)) ?? {};
    const providers = config.models?.providers ?? {};
    providers[PROVIDER] = providerEntry(models, apiKey);
    config.models = { ...(config.models ?? {}), providers };

    // OpenClaw treats a configured primary as intentional, so an existing
    // non-Pollinations default is kept and only reported.
    let switched = true;
    if (primaryModel(config) === undefined) {
        config.agents = {
            ...(config.agents ?? {}),
            defaults: {
                ...(config.agents?.defaults ?? {}),
                model: {
                    ...(config.agents?.defaults?.model ?? {}),
                    primary: `${PROVIDER}/${model}`,
                },
            },
        };
    } else if (primaryModel(config) !== `${PROVIDER}/${model}`) {
        switched = false;
    }
    writeJsonAtomic(configPath(ctx), config);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
    if (!switched) {
        printInfo(
            `Kept your existing default model. Switch with: openclaw models set ${PROVIDER}/${model}`,
        );
    }
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = false;
    const config = readJsonIfExists<OpenClawConfig>(configPath(ctx));
    if (config) {
        const providers = config.models?.providers;
        if (providers && PROVIDER in providers) {
            delete providers[PROVIDER];
            changed = true;
        }
        if (primaryModel(config)?.startsWith(`${PROVIDER}/`)) {
            delete config.agents?.defaults?.model?.primary;
            changed = true;
        }
        if (changed) writeJsonAtomic(configPath(ctx), config);
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readJsonIfExists<OpenClawConfig>(configPath(ctx));
    const provider = config?.models?.providers?.[PROVIDER] as
        | { baseUrl?: string; api?: string }
        | undefined;
    const primary = primaryModel(config ?? {});
    const model = primary?.startsWith(`${PROVIDER}/`)
        ? primary.slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
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
        const result = configureOpenclaw(ctx, models, apiKey, model);
        if (!isInstalled("openclaw")) {
            printInfo(
                `OpenClaw was not found. Install it with: curl -fsSL https://openclaw.ai/install.sh | bash`,
            );
        }
        return result;
    },

    off: disableOpenclaw,
    status: result,
};
