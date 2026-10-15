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
const LEGACY_PLUGIN_SPEC = "opencode-pollinations-plugin";
const MAX_OUTPUT_TOKENS = 32768;

/**
 * Registers Pollinations as an `@ai-sdk/openai-compatible` provider, which
 * OpenCode 1.x reads natively and 2.x still accepts (the 2.0 plugin API
 * rejects the old `opencode-pollinations-plugin`). The key goes in the
 * provider's `options.apiKey`, which both versions pass straight to the SDK,
 * and in OpenCode's own `auth.json` store, which 1.x reads per run and 2.x
 * imports into its credential database on a fresh install.
 */
const dataDir = (ctx: HarnessContext) => {
    const xdg = ctx.env.XDG_DATA_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".local", "share"),
        "opencode",
    );
};

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

const authFile = (ctx: HarnessContext) => join(dataDir(ctx), "auth.json");

// Where the old 1.x plugin kept its key. Read once for migration, then
// emptied of our entry — the key moves to OpenCode's auth.json.
const legacyPluginConfigFile = (ctx: HarnessContext) =>
    join(pollinationsConfigDir(ctx), "config.json");

const files = (ctx: HarnessContext) => [
    opencodeConfigFile(ctx),
    authFile(ctx),
    legacyPluginConfigFile(ctx),
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

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const isLegacyPlugin = (entry: unknown) =>
    typeof entry === "string"
        ? entry.includes(LEGACY_PLUGIN_SPEC)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" &&
                  value.includes(LEGACY_PLUGIN_SPEC),
          );

const pluginListKey = (config: Record<string, unknown>) =>
    Array.isArray(config.plugins) && !Array.isArray(config.plugin)
        ? "plugins"
        : "plugin";

const readAuthKey = (ctx: HarnessContext): string | null => {
    const key = asRecord(readJson(authFile(ctx))?.[PROVIDER]).key;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const readLegacyKey = (ctx: HarnessContext): string | null => {
    const key = readJson(legacyPluginConfigFile(ctx))?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const readApiKey = (ctx: HarnessContext): string | null =>
    readAuthKey(ctx) ?? readLegacyKey(ctx);

const writeApiKey = (ctx: HarnessContext, apiKey: string) => {
    const auth = readJson(authFile(ctx)) ?? {};
    auth[PROVIDER] = { type: "api", key: apiKey };
    writeJson(authFile(ctx), auth);
};

const deleteApiKey = (ctx: HarnessContext) => {
    const path = authFile(ctx);
    const auth = readJson(path);
    if (auth === null || !(PROVIDER in auth)) return false;
    delete auth[PROVIDER];
    if (Object.keys(auth).length === 0) removeIfExists(path);
    else writeJson(path, auth);
    return true;
};

// The plugin is gone from the config, so its private key copy goes too.
const deleteLegacyKey = (ctx: HarnessContext) => {
    const path = legacyPluginConfigFile(ctx);
    const config = readJson(path);
    if (config === null || config.apiKey === undefined) return false;
    delete config.apiKey;
    if (Object.keys(config).length === 0) removeIfExists(path);
    else writeJson(path, config);
    return true;
};

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

const defaultModelRef = (model: string) => `${PROVIDER}/${model}`;

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const providerBlock = (models: HarnessModel[], apiKey: string) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations",
    options: { baseURL: `${BASE_URL}/v1`, apiKey },
    models: Object.fromEntries(
        models.map((model) => [
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

const dropLegacyPlugin = (config: Record<string, unknown>) => {
    const key = pluginListKey(config);
    const entries = config[key];
    if (!Array.isArray(entries) || !entries.some(isLegacyPlugin)) return false;
    const kept = entries.filter((entry) => !isLegacyPlugin(entry));
    if (kept.length === 0) delete config[key];
    else config[key] = kept;
    return true;
};

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    apiKey: string,
    model: string,
    models: HarnessModel[],
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    dropLegacyPlugin(config);
    config.provider = {
        ...asRecord(config.provider),
        [PROVIDER]: providerBlock(models, apiKey),
    };
    config.model = defaultModelRef(model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext) => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = dropLegacyPlugin(config);

    const providers = asRecord(config.provider);
    if (PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0) delete config.provider;
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
        ? (config.model as string).slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            PROVIDER in asRecord(config.provider) &&
            model !== undefined &&
            readApiKey(ctx) !== null,
        model,
        files: files(ctx),
    };
};

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    writeOpenCodeConfig(ctx, settings.apiKey, settings.model, settings.models);
    writeApiKey(ctx, settings.apiKey);
    deleteLegacyKey(ctx);
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = stripOpenCodeConfig(ctx);
    changed = deleteApiKey(ctx) || changed;
    changed = deleteLegacyKey(ctx) || changed;
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
        "Restart OpenCode, then pick a Pollinations model with /models. For image, audio, and video tools, run: polli mcp install opencode --all",

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
                existingKey: readApiKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
