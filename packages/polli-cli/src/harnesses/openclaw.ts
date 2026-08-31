import { spawnSync } from "node:child_process";
import { join } from "node:path";
import JSON5 from "json5";
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
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";
// Any tool-calling text model is a valid target; OpenClaw exposes all
// pollinations/* models via the default model's provider block.
const INSTALL_URL = "https://docs.openclaw.ai/install";

const openclawHome = (ctx: HarnessContext) => {
    const configured = ctx.env.OPENCLAW_CONFIG_DIR;
    return configured?.trim() ? configured.trim() : join(ctx.home, ".openclaw");
};
// Support OPENCLAW_CONFIG_PATH like the gateway does; fall back to the default
// path under the resolved OpenClaw config dir.
const configPath = (ctx: HarnessContext) =>
    ctx.env.OPENCLAW_CONFIG_PATH?.trim() ||
    join(openclawHome(ctx), "openclaw.json");
// Shared skill root referenced from `skills.load.extraDirs`; OpenClaw expands
// `~` in configured paths, so an absolute or home-anchored value both resolve.
const skillDir = (ctx: HarnessContext) => join(openclawHome(ctx), "skills");
const skillPath = (ctx: HarnessContext) =>
    join(skillDir(ctx), "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

// JSON5 is a superset of JSON, so a structural merge on the parsed object is
// safe. We do not round-trip comments (the reference `jq`-based setup script
// does not either); `off` restores the original file byte-for-byte via snapshot.
const loadConfig = (ctx: HarnessContext): Record<string, unknown> => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return {};
    return JSON5.parse(text) as Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const getRecord = (
    root: Record<string, unknown>,
    ...path: string[]
): Record<string, unknown> | undefined => {
    let current: unknown = root;
    for (const key of path) {
        if (!(current && typeof current === "object")) return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return asRecord(current);
};

const readKey = (ctx: HarnessContext): string | null => {
    const config = loadConfig(ctx);
    const value = getRecord(config, "env", "vars")?.[KEY_ENV];
    return typeof value === "string" && value ? value : null;
};

const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `\${${KEY_ENV}}`,
    api: "openai-completions",
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        reasoning: false,
        input: model.input,
        contextWindow: model.contextWindow,
    })),
});

interface OpenclawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const ensureOpenclaw = () => {
    const which = process.platform === "win32" ? "where" : "which";
    const installed = spawnSync(which, ["openclaw"], { stdio: "ignore" })
        .status === 0;
    if (!installed) {
        throw new Error(
            `OpenClaw is not installed. Install it first: ${INSTALL_URL}`,
        );
    }
};

const writeConfig = (ctx: HarnessContext, settings: OpenclawSettings) => {
    const doc = loadConfig(ctx);
    const env = asRecord(doc.env);
    const vars = Object.assign({}, asRecord(env.vars));
    vars[KEY_ENV] = settings.apiKey;
    env.vars = vars;
    doc.env = env;

    const models = asRecord(doc.models);
    if (models.mode === undefined || models.mode === null) {
        models.mode = "merge";
    }
    // OpenClaw discovers every model the provider declares, so `pollinations/*`
    // makes the full live catalog switchable without a second hardcoded list.
    const providers = asRecord(models.providers);
    providers[PROVIDER] = providerConfig(settings.models);
    models.providers = providers;
    doc.models = models;

    const agents = asRecord(doc.agents);
    const defaults = asRecord(agents.defaults);
    const defaultModel = asRecord(defaults.model);
    const fallbacks = Array.isArray(defaultModel.fallbacks)
        ? defaultModel.fallbacks
        : [];
    defaultModel.primary = `${PROVIDER}/${settings.model}`;
    defaultModel.fallbacks = fallbacks;
    defaults.model = defaultModel;
    const defaultModels = asRecord(defaults.models);
    defaultModels[`${PROVIDER}/*`] = asRecord(defaultModels[`${PROVIDER}/*`]);
    defaults.models = defaultModels;
    agents.defaults = defaults;
    doc.agents = agents;

    const skills = asRecord(doc.skills);
    const load = asRecord(skills.load);
    const extraDirs = Array.isArray(load.extraDirs)
        ? (load.extraDirs as string[]).filter((dir) => dir !== skillDir(ctx))
        : [];
    extraDirs.push(skillDir(ctx));
    load.extraDirs = extraDirs;
    skills.load = load;
    doc.skills = skills;

    writeTextAtomic(configPath(ctx), JSON.stringify(doc, null, 2) + "\n", 0o600);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripProvider = (doc: Record<string, unknown>): boolean => {
    const models = asRecord(doc.models);
    const providers = asRecord(models.providers);
    if (providers[PROVIDER] === undefined) return false;
    delete providers[PROVIDER];
    if (Object.keys(providers).length === 0) {
        // If pollinations was the only provider, `merge` mode we introduced has
        // nothing left to merge, so drop it along with the empty provider map.
        if (models.mode === "merge") delete models.mode;
        delete models.providers;
        if (Object.keys(models).length === 0) delete doc.models;
        else doc.models = models;
    } else {
        models.providers = providers;
        doc.models = models;
    }
    return true;
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadConfig(ctx);
    let changed = false;

    const env = asRecord(doc.env);
    const vars = asRecord(env.vars);
    if (vars[KEY_ENV] !== undefined) {
        delete vars[KEY_ENV];
        if (Object.keys(vars).length === 0) {
            delete env.vars;
            if (Object.keys(env).length === 0) delete doc.env;
            else doc.env = env;
        } else {
            env.vars = vars;
            doc.env = env;
        }
        changed = true;
    }

    changed = stripProvider(doc) || changed;

    const agents = asRecord(doc.agents);
    const defaults = asRecord(agents.defaults);
    const defaultModels = asRecord(defaults.models);
    delete defaultModels[`${PROVIDER}/*`];
    if (Object.keys(defaultModels).length === 0) delete defaults.models;
    else defaults.models = defaultModels;
    const defaultModel = asRecord(defaults.model);
    if (
        typeof defaultModel.primary === "string" &&
        defaultModel.primary.startsWith(`${PROVIDER}/`)
    ) {
        delete defaultModel.primary;
        if (Object.keys(defaultModel).length === 0) delete defaults.model;
        else defaults.model = defaultModel;
        changed = true;
    }
    agents.defaults = defaults;
    doc.agents = agents;

    const skills = asRecord(doc.skills);
    const load = asRecord(skills.load);
    const removingSkillDir =
        Array.isArray(load.extraDirs) &&
        (load.extraDirs as string[]).includes(skillDir(ctx));
    if (removingSkillDir) {
        const remaining = (load.extraDirs as string[]).filter(
            (dir) => dir !== skillDir(ctx),
        );
        if (remaining.length === 0) delete load.extraDirs;
        else load.extraDirs = remaining;
        if (Object.keys(load).length === 0) delete skills.load;
        if (Object.keys(skills).length === 0) delete doc.skills;
        else doc.skills = skills;
        changed = true;
    }

    if (changed) {
        if (Object.keys(doc).length === 0) {
            removeIfExists(configPath(ctx));
        } else {
            writeTextAtomic(
                configPath(ctx),
                JSON.stringify(doc, null, 2) + "\n",
                0o600,
            );
        }
    }

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadConfig(ctx);
    const primary = getRecord(doc, "agents", "defaults", "model")?.primary;
    const provider = getRecord(doc, "models", "providers", PROVIDER);
    return {
        harness: ID,
        label: LABEL,
        configured:
            readKey(ctx) !== null &&
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            typeof primary === "string" &&
            primary.startsWith(`${PROVIDER}/`) &&
            readTextIfExists(skillPath(ctx)) !== null,
        model:
            typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)
                ? primary.slice(PROVIDER.length + 1)
                : undefined,
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
    restartHint: "Restart the gateway so the config loads: openclaw gateway restart",

    async on(ctx, options) {
        ensureOpenclaw();
        const models = await fetchHarnessModels();
        const defaultModel =
            options.model ??
            (models.some((m) => m.id === "kimi") ? "kimi" : models[0]?.id);
        if (!defaultModel) {
            throw new Error("No tool-calling Pollinations models are available.");
        }
        if (!models.some((candidate) => candidate.id === defaultModel)) {
            throw new Error(
                `Model "${defaultModel}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureOpenclaw(ctx, {
            apiKey,
            model: defaultModel,
            models,
        });
    },

    off: disableOpenclaw,
    status: result,
};
