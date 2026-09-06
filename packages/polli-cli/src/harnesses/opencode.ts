import { join } from "node:path";
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
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "opencode";
const LABEL = "OpenCode";
const DEFAULT_MODEL = "openai";
const PLUGIN_SPEC = "opencode-pollinations-plugin";

/**
 * OpenCode's Pollinations plugin registers the `pollinations` provider itself
 * (models as `free/<id>` and `enter/<id>`), serves its media tools, usage,
 * and quest commands, and reads `apiKey` from its own config.json first. The
 * harness therefore only wires the plugin in, stores the dedicated key, and
 * points OpenCode's default model at the plugin's `enter/` catalog.
 */
const pollinationsConfigDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        return join(ctx.env.APPDATA ?? ctx.home, "pollinations");
    }
    if (process.platform === "darwin") {
        return join(ctx.home, "Library", "Application Support", "pollinations");
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "pollinations",
    );
};

const opencodeConfigFile = (ctx: HarnessContext) => {
    if (ctx.env.OPENCODE_CONFIG?.trim()) {
        return resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG);
    }
    const dir = ctx.env.OPENCODE_CONFIG_DIR?.trim()
        ? resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG_DIR)
        : join(ctx.home, ".config", "opencode");
    return join(dir, "opencode.json");
};

const pluginConfigFile = (ctx: HarnessContext) =>
    join(pollinationsConfigDir(ctx), "config.json");

const files = (ctx: HarnessContext) => [
    opencodeConfigFile(ctx),
    pluginConfigFile(ctx),
];

const readJson = (path: string): Record<string, unknown> | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
};

const writeJson = (path: string, data: unknown) =>
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);

const isPluginEntry = (entry: unknown) =>
    typeof entry === "string"
        ? entry === PLUGIN_SPEC || entry.includes(PLUGIN_SPEC)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" && value.includes(PLUGIN_SPEC),
          );

const pluginListKey = (config: Record<string, unknown>) =>
    Array.isArray(config.plugins) && !Array.isArray(config.plugin)
        ? "plugins"
        : "plugin";

const hasPluginEntry = (config: Record<string, unknown>) => {
    const entries = config[pluginListKey(config)];
    return Array.isArray(entries) && entries.some(isPluginEntry);
};

const readApiKey = (ctx: HarnessContext): string | null => {
    const key = readJson(pluginConfigFile(ctx))?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const writeApiKey = (ctx: HarnessContext, apiKey: string) => {
    const config = readJson(pluginConfigFile(ctx)) ?? {};
    config.apiKey = apiKey;
    writeJson(pluginConfigFile(ctx), config);
};

const deleteApiKey = (ctx: HarnessContext) => {
    const path = pluginConfigFile(ctx);
    const config = readJson(path);
    if (config === null || config.apiKey === undefined) return false;
    delete config.apiKey;
    if (Object.keys(config).length === 0) removeIfExists(path);
    else writeJson(path, config);
    return true;
};

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

// The plugin exposes paid tool-calling models as `enter/<id>` under its own
// `pollinations` provider.
const defaultModelRef = (model: string) => `pollinations/enter/${model}`;

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith("pollinations/enter/");

const writeOpenCodeConfig = (ctx: HarnessContext, model: string) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    if (!hasPluginEntry(config)) {
        const key = pluginListKey(config);
        const entries = Array.isArray(config[key]) ? config[key] : [];
        config[key] = [...entries, PLUGIN_SPEC];
    }
    config.model = defaultModelRef(model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext) => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = false;

    const key = pluginListKey(config);
    const entries = config[key];
    if (Array.isArray(entries) && entries.some(isPluginEntry)) {
        const filtered = entries.filter((entry) => !isPluginEntry(entry));
        if (filtered.length === 0) delete config[key];
        else config[key] = filtered;
        changed = true;
    }

    if (isOurDefaultModel(config.model)) {
        delete config.model;
        changed = true;
    }

    if (changed) writeJson(path, config);
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const model = isOurDefaultModel(config.model)
        ? (config.model as string).slice("pollinations/enter/".length)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            hasPluginEntry(config) &&
            isOurDefaultModel(config.model) &&
            readApiKey(ctx) !== null,
        model,
        files: files(ctx),
    };
};

interface OpenCodeSettings {
    apiKey: string;
    model: string;
}

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    writeOpenCodeConfig(ctx, settings.model);
    writeApiKey(ctx, settings.apiKey);
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = stripOpenCodeConfig(ctx);
    changed = deleteApiKey(ctx) || changed;
    return changed;
};

export const configureOpenCode = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableOpenCode = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

const openCodeInstalled = (ctx: HarnessContext) =>
    commandExists("opencode", ctx.env, [
        join(ctx.home, ".opencode", "bin", "opencode"),
    ]);

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode to use Pollinations",
    restartHint:
        "Restart OpenCode, then pick a Pollinations model with /models. Inside OpenCode: /poll quests shows claimable Pollen, /poll help lists the media tools.",

    async on(ctx, options) {
        if (!openCodeInstalled(ctx)) {
            throw new Error(
                "OpenCode was not found. Install it first: curl -fsSL https://opencode.ai/install | bash",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readApiKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model });
    },

    off: disableOpenCode,
    status: result,
};
