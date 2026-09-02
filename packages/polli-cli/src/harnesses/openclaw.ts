import { join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
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
// Key is stored once in env.vars and referenced as ${VAR} from the provider,
// matching OpenClaw's own config-level variable substitution.
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";

const expandTilde = (ctx: HarnessContext, value: string) =>
    value === "~"
        ? ctx.home
        : value.startsWith("~/") || value.startsWith("~\\")
          ? join(ctx.home, value.slice(2))
          : value;

/** Mutable state dir; OpenClaw expands a leading `~` in OPENCLAW_STATE_DIR. */
export const openclawStateDir = (ctx: HarnessContext) => {
    const configured = ctx.env.OPENCLAW_STATE_DIR?.trim();
    return configured ? expandTilde(ctx, configured) : join(ctx.home, ".openclaw");
};

// The active config path: OPENCLAW_CONFIG_PATH wins, else $STATE_DIR/openclaw.json.
const configPath = (ctx: HarnessContext) => {
    const override = ctx.env.OPENCLAW_CONFIG_PATH?.trim();
    return override
        ? expandTilde(ctx, override)
        : join(openclawStateDir(ctx), "openclaw.json");
};

// Managed skills live under the state dir and are shared by all local agents.
const skillFile = (ctx: HarnessContext) =>
    join(openclawStateDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillFile(ctx)];

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const saveJson = (path: string, data: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
};

const readKey = (ctx: HarnessContext): string | null => {
    const env = loadJson(configPath(ctx)).env as
        | Record<string, unknown>
        | undefined;
    const key = env?.vars?.[KEY_ENV];
    return typeof key === "string" && key ? key : null;
};

const providerEntry = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `\${${KEY_ENV}}`,
    api: "openai-completions",
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        contextWindow: model.contextWindow,
        input: model.input,
    })),
});

interface OpenClawConfig {
    env?: { vars?: Record<string, unknown> };
    models?: {
        mode?: string;
        providers?: Record<string, unknown>;
    };
    agents?: {
        defaults?: { model?: { primary?: unknown } };
    };
    [key: string]: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    const doc = loadJson(configPath(ctx)) as OpenClawConfig;

    const env = asRecord(doc.env);
    const vars = asRecord(env.vars);
    vars[KEY_ENV] = apiKey;
    env.vars = vars;
    doc.env = env;

    const modelsConfig = asRecord(doc.models);
    // Never override an explicit merge strategy the user already chose.
    if (modelsConfig.mode === undefined) modelsConfig.mode = "merge";
    const providers = asRecord(modelsConfig.providers);
    providers[PROVIDER] = providerEntry(models);
    modelsConfig.providers = providers;
    doc.models = modelsConfig;

    const agents = asRecord(doc.agents);
    const defaults = asRecord(agents.defaults);
    const agentModel = asRecord(defaults.model);
    agentModel.primary = `${PROVIDER}/${model}`;
    defaults.model = agentModel;
    agents.defaults = defaults;
    doc.agents = agents;

    saveJson(configPath(ctx), doc);

    if (readTextIfExists(skillFile(ctx)) === null) {
        writeTextAtomic(skillFile(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;
    const doc = loadJson(configPath(ctx)) as OpenClawConfig;

    if (doc.env?.vars && KEY_ENV in asRecord(doc.env.vars)) {
        const vars = asRecord(doc.env.vars);
        delete vars[KEY_ENV];
        if (Object.keys(vars).length === 0) delete doc.env.vars;
        saveJson(configPath(ctx), doc);
        changed = true;
    }

    const providers = asRecord(doc.models?.providers);
    if (PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0)
            delete (asRecord(doc.models)).providers;
        saveJson(configPath(ctx), doc);
        changed = true;
    }

    const primary = asRecord(doc.agents?.defaults?.model).primary;
    // Only drop a default we set; a user-chosen model like openai/gpt-5 stays.
    if (typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)) {
        delete (asRecord(asRecord(doc.agents).defaults).model).primary;
        saveJson(configPath(ctx), doc);
        changed = true;
    }

    if (readTextIfExists(skillFile(ctx)) === polliSkill) {
        removeIfExists(skillFile(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadJson(configPath(ctx)) as OpenClawConfig;
    const provider = asRecord(doc.models?.providers?.[PROVIDER]);
    const primary = asRecord(doc.agents?.defaults?.model).primary;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            provider?.apiKey === `\${${KEY_ENV}}` &&
            typeof primary === "string" &&
            primary.startsWith(`${PROVIDER}/`) &&
            readKey(ctx) !== null &&
            readTextIfExists(skillFile(ctx)) !== null,
        model:
            typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)
                ? primary.slice(`${PROVIDER}/`.length)
                : undefined,
        files: files(ctx),
    };
};

export const configureOpenClaw = (
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

export const disableOpenClaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

const openclawInstalled = (ctx: HarnessContext) =>
    commandExists("openclaw", ctx.env, [
        join(openclawStateDir(ctx), "bin", "openclaw"),
    ]);

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a provider in OpenClaw",
    restartHint:
        "Restart the gateway: openclaw gateway restart (or /model inside chat to switch).",

    async on(ctx, options) {
        if (!openclawInstalled(ctx)) {
            throw new Error(
                "OpenClaw was not found. Install it from: https://openclaw.ai/install",
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
        return configureOpenClaw(ctx, models, apiKey, model);
    },

    off: disableOpenClaw,
    status: result,
};
