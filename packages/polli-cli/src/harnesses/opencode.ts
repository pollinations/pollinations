import { join } from "node:path";
import JSON5 from "json5";
import { BASE_URL } from "../lib/config.js";
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
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "opencode";
const LABEL = "OpenCode";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai/gpt-6-sol";
const PLUGIN_SPEC = "opencode-pollinations-plugin";
const MAX_OUTPUT_TOKENS = 16384;

// OpenCode 1.x reads `provider.options`; 2.0 prefers native
// `providers.settings`. Write both: 2.0 does not use 1.x's auth.json key,
// and a pre-existing native provider can shadow the migrated 1.x block.
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

export const opencodeConfigFile = (ctx: HarnessContext) => {
    if (ctx.env.OPENCODE_CONFIG?.trim()) {
        return resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG);
    }
    const dir = ctx.env.OPENCODE_CONFIG_DIR?.trim()
        ? resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG_DIR)
        : join(ctx.home, ".config", "opencode");
    return (
        ["opencode.jsonc", "opencode.json", "config.json"]
            .map((name) => join(dir, name))
            .find((path) => readTextIfExists(path) !== null) ??
        join(dir, "opencode.json")
    );
};

const pluginConfigFile = (ctx: HarnessContext) =>
    join(pollinationsConfigDir(ctx), "config.json");

// Keep the old file set so `off` can still restore snapshots made by the
// plugin-based CLI, even though new setups no longer write the plugin file.
const files = (ctx: HarnessContext) => [
    opencodeConfigFile(ctx),
    pluginConfigFile(ctx),
];

const readJson = (path: string): Record<string, unknown> | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    try {
        const parsed = JSON5.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch (error) {
        throw new Error(`Could not parse OpenCode config at ${path}`, {
            cause: error,
        });
    }
    throw new Error(`OpenCode config at ${path} must contain an object`);
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

const removePluginEntry = (config: Record<string, unknown>) => {
    const key = pluginListKey(config);
    const entries = config[key];
    if (!Array.isArray(entries) || !entries.some(isPluginEntry)) return false;
    const kept = entries.filter((entry) => !isPluginEntry(entry));
    if (kept.length === 0) delete config[key];
    else config[key] = kept;
    return true;
};

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const readPluginKey = (ctx: HarnessContext): string | null => {
    const key = readJson(pluginConfigFile(ctx))?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const deletePluginKey = (ctx: HarnessContext) => {
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

const legacyProvider = (config: Record<string, unknown>) =>
    asRecord(asRecord(config.provider)[PROVIDER]);
const nativeProvider = (config: Record<string, unknown>) =>
    asRecord(asRecord(config.providers)[PROVIDER]);

const readProviderKey = (config: Record<string, unknown>): string | null => {
    const key =
        asRecord(nativeProvider(config).settings).apiKey ??
        asRecord(legacyProvider(config).options).apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const defaultModelRef = (model: string) => `${PROVIDER}/${model}`;

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const providerBlock = (settings: OpenCodeSettings) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations",
    options: { baseURL: `${BASE_URL}/v1`, apiKey: settings.apiKey },
    models: Object.fromEntries(
        settings.models.map((model) => [
            model.id,
            {
                name: model.id,
                tool_call: true,
                limit: {
                    context: model.contextWindow,
                    output: Math.min(model.contextWindow, MAX_OUTPUT_TOKENS),
                },
                modalities: { input: model.input, output: ["text"] },
            },
        ]),
    ),
});

const nativeProviderBlock = (settings: OpenCodeSettings) => ({
    package: "@opencode/ai/providers/openai-compatible",
    name: "Pollinations",
    settings: { baseURL: `${BASE_URL}/v1`, apiKey: settings.apiKey },
    models: Object.fromEntries(
        settings.models.map((model) => [
            model.id,
            {
                name: model.id,
                limit: {
                    context: model.contextWindow,
                    output: Math.min(model.contextWindow, MAX_OUTPUT_TOKENS),
                },
                capabilities: {
                    tools: true,
                    input: model.input,
                    output: ["text"],
                },
            },
        ]),
    ),
});

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    removePluginEntry(config);
    config.provider = {
        ...asRecord(config.provider),
        [PROVIDER]: providerBlock(settings),
    };
    config.providers = {
        ...asRecord(config.providers),
        [PROVIDER]: nativeProviderBlock(settings),
    };
    config.model = defaultModelRef(settings.model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext) => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = removePluginEntry(config);

    for (const key of ["provider", "providers"] as const) {
        const providers = asRecord(config[key]);
        if (PROVIDER in providers) {
            delete providers[PROVIDER];
            if (Object.keys(providers).length === 0) delete config[key];
            changed = true;
        }
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
        ? (config.model as string).slice(PROVIDER.length + 1)
        : undefined;
    const key = readProviderKey(config);
    return {
        harness: ID,
        label: LABEL,
        configured:
            model !== undefined &&
            model in asRecord(legacyProvider(config).models) &&
            model in asRecord(nativeProvider(config).models) &&
            key !== null &&
            asRecord(legacyProvider(config).options).apiKey === key &&
            asRecord(nativeProvider(config).settings).apiKey === key,
        model,
        files: files(ctx),
    };
};

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    writeOpenCodeConfig(ctx, settings);
};

const stripConfig = (ctx: HarnessContext) => {
    // Off from an older CLI still removes the plugin's own stored key. New
    // setups never touch it, so don't erase a pre-existing user's plugin key.
    const hadPlugin = hasPluginEntry(openCodeConfig(ctx));
    let changed = stripOpenCodeConfig(ctx);
    if (hadPlugin) changed = deletePluginKey(ctx) || changed;
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
        "Restart OpenCode, then pick a Pollinations model with /models. For media tools, run: polli mcp install opencode --all",

    async on(ctx, options) {
        if (!openCodeInstalled(ctx)) {
            throw new Error(
                "OpenCode was not found. Install it first: curl -fsSL https://opencode.ai/install | bash",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey:
                    readProviderKey(openCodeConfig(ctx)) ?? readPluginKey(ctx),
            },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
