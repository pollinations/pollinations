import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
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
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "opencode";
const LABEL = "OpenCode";
const PLUGIN = "opencode-pollinations-plugin";
const DEFAULT_MODEL = "deepseek";
// The plugin stores its key under the Pollinations config dir and injects the
// provider into OpenCode at startup, so the harness never writes a provider block.
const MODEL_REF_PREFIX = "pollinations/";

/** OpenCode global config file, honoring its documented env overrides. */
export const opencodeConfigPath = (ctx: HarnessContext) => {
    if (ctx.env.OPENCODE_CONFIG?.trim()) return ctx.env.OPENCODE_CONFIG;
    const dir =
        ctx.env.OPENCODE_CONFIG_DIR?.trim() ||
        join(ctx.home, ".config", "opencode");
    return join(dir, "opencode.json");
};

const pluginConfigPath = (ctx: HarnessContext) => {
    const appData = ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming");
    const dir = ctx.env.APPDATA
        ? join(appData, "pollinations")
        : process.platform === "darwin"
          ? join(ctx.home, "Library", "Application Support", "pollinations")
          : join(
                ctx.env.XDG_CONFIG_HOME?.trim() || join(ctx.home, ".config"),
                "pollinations",
            );
    return join(dir, "config.json");
};

const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, ".config", "opencode", "skills", "polli", "SKILL.md");

interface OpenCodeConfig {
    plugin?: string[];
    model?: string;
    [key: string]: unknown;
}

const readPluginConfig = (ctx: HarnessContext): { apiKey?: string } | null =>
    readJsonIfExists(pluginConfigPath(ctx));

const pluginEnabled = (config: OpenCodeConfig) =>
    Array.isArray(config.plugin) && config.plugin.includes(PLUGIN);

const files = (ctx: HarnessContext) => [
    opencodeConfigPath(ctx),
    pluginConfigPath(ctx),
    skillPath(ctx),
];

interface OpenCodeSettings {
    apiKey: string;
    model: string;
}

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    const path = opencodeConfigPath(ctx);
    const config = readJsonIfExists<OpenCodeConfig>(path) ?? {};
    const plugins = Array.isArray(config.plugin) ? config.plugin : [];
    config.plugin = plugins.includes(PLUGIN) ? plugins : [...plugins, PLUGIN];
    config.model = `${MODEL_REF_PREFIX}${settings.model}`;
    writeJsonAtomic(path, config);

    const pluginPath = pluginConfigPath(ctx);
    const pluginConfig =
        readJsonIfExists<Record<string, unknown>>(pluginPath) ?? {};
    pluginConfig.apiKey = settings.apiKey;
    writeJsonAtomic(pluginPath, pluginConfig);

    // The plugin ships its own media, usage, and quest tools; the Polli skill
    // only documents model selection and credentials for OpenCode sessions.
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = false;
    const path = opencodeConfigPath(ctx);
    const config = readJsonIfExists<OpenCodeConfig>(path);
    if (config) {
        if (Array.isArray(config.plugin) && config.plugin.includes(PLUGIN)) {
            config.plugin = config.plugin.filter((p) => p !== PLUGIN);
            if (config.plugin.length === 0) delete config.plugin;
            changed = true;
        }
        if (
            typeof config.model === "string" &&
            config.model.startsWith(MODEL_REF_PREFIX)
        ) {
            delete config.model;
            changed = true;
        }
        if (changed) writeJsonAtomic(path, config);
    }

    const pluginPath = pluginConfigPath(ctx);
    const pluginConfig = readJsonIfExists<Record<string, unknown>>(pluginPath);
    if (pluginConfig && "apiKey" in pluginConfig) {
        delete pluginConfig.apiKey;
        writeJsonAtomic(pluginPath, pluginConfig);
        changed = true;
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readJsonIfExists<OpenCodeConfig>(opencodeConfigPath(ctx));
    const model =
        typeof config?.model === "string" &&
        config.model.startsWith(MODEL_REF_PREFIX)
            ? config.model.slice(MODEL_REF_PREFIX.length)
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            pluginEnabled(config ?? {}) &&
            typeof readPluginConfig(ctx)?.apiKey === "string",
        model,
        files: files(ctx),
    };
};

export const configureOpenCode = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableOpenCode = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Enable the Pollinations OpenCode plugin and set a default model",
    restartHint: "Changes apply after restarting OpenCode.",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readPluginConfig(ctx)?.apiKey ?? null,
            },
            { browser: options.browser },
        );
        if (
            !ctx.env.OPENCODE_CONFIG?.trim() &&
            !ctx.env.OPENCODE_CONFIG_DIR?.trim()
        ) {
            // opencode.json is also valid JSONC, which JSON.parse rejects.
            if (
                readTextIfExists(opencodeConfigPath(ctx))
                    ?.trimStart()
                    .startsWith("//")
            ) {
                throw new Error(
                    `${opencodeConfigPath(ctx)} uses comments. Convert it to plain JSON and retry.`,
                );
            }
        }
        const result = configureOpenCode(ctx, { apiKey, model });
        if (!isInstalled("opencode")) {
            printInfo(
                `OpenCode was not found. Install it with: curl -fsSL https://opencode.ai/install | bash`,
            );
        }
        return result;
    },

    off: disableOpenCode,
    status: result,
};
