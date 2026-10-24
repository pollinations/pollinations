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
const PROVIDER_NPM = "@ai-sdk/openai-compatible";
/**
 * OpenCode's config schema requires `limit.output` alongside `limit.context`
 * and rejects the whole file without it ("Configuration is invalid ... Missing
 * key ...limit.output"). The models API exposes no output cap, so this is a
 * fallback, not a per-model limit.
 */
const MAX_OUTPUT_TOKENS = 32768;
/** The 1.x plugin earlier versions of `on` enabled; cleaned up when found. */
const LEGACY_PLUGIN = "opencode-pollinations-plugin";

/**
 * OpenCode 1.x and 2.0 both read the 1.x `provider` block: 2.0 normalizes V1
 * config in memory and no longer loads 1.x plugins, which is why `on` writes a
 * `pollinations` provider instead of enabling `opencode-pollinations-plugin`.
 * The block lists the models `on` already fetches, so one config serves both
 * versions and the provider's `options.apiKey` is where both read the key.
 */
const legacyConfigDir = (ctx: HarnessContext) => {
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

/** `~/.config/pollinations/config.json`, written by the removed 1.x plugin. */
const legacyKeyFile = (ctx: HarnessContext) =>
    join(legacyConfigDir(ctx), "config.json");

const files = (ctx: HarnessContext) => [
    opencodeConfigFile(ctx),
    legacyKeyFile(ctx),
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

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

const providersOf = (config: Record<string, unknown>) => {
    const providers = config.provider;
    return providers !== null && typeof providers === "object"
        ? (providers as Record<string, unknown>)
        : {};
};

const isOurProvider = (entry: unknown): entry is Record<string, unknown> => {
    if (entry === null || typeof entry !== "object") return false;
    const options = (entry as Record<string, unknown>).options;
    return (
        options !== null &&
        typeof options === "object" &&
        (options as Record<string, unknown>).baseURL === `${BASE_URL}/v1`
    );
};

/** The plugin entry `on` used to add, in string or object form. */
const isLegacyPlugin = (entry: unknown) =>
    typeof entry === "string"
        ? entry === LEGACY_PLUGIN || entry.includes(LEGACY_PLUGIN)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" && value.includes(LEGACY_PLUGIN),
          );

const pluginListKey = (config: Record<string, unknown>) =>
    Array.isArray(config.plugins) && !Array.isArray(config.plugin)
        ? "plugins"
        : "plugin";

const removeLegacyPlugin = (config: Record<string, unknown>) => {
    const key = pluginListKey(config);
    const entries = config[key];
    if (!Array.isArray(entries) || !entries.some(isLegacyPlugin)) return false;
    const filtered = entries.filter((entry) => !isLegacyPlugin(entry));
    if (filtered.length === 0) delete config[key];
    else config[key] = filtered;
    return true;
};

const readKey = (ctx: HarnessContext): string | null => {
    const entry = providersOf(openCodeConfig(ctx))[PROVIDER];
    const key = isOurProvider(entry)
        ? (entry.options as Record<string, unknown>).apiKey
        : undefined;
    return typeof key === "string" && key.length > 5 ? key : null;
};

/** Key the removed 1.x plugin stored, reused so `on` need not log in again. */
const legacyKey = (ctx: HarnessContext): string | null => {
    const key = readJson(legacyKeyFile(ctx))?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

/** Drops the removed plugin's key, keeping its other settings (as main did). */
const deleteLegacyKey = (ctx: HarnessContext) => {
    const path = legacyKeyFile(ctx);
    const config = readJson(path);
    if (config === null || config.apiKey === undefined) return false;
    delete config.apiKey;
    if (Object.keys(config).length === 0) removeIfExists(path);
    else writeJson(path, config);
    return true;
};

const providerBlock = (models: HarnessModel[], apiKey: string) => ({
    npm: PROVIDER_NPM,
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

const writeConfig = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
) => {
    const path = opencodeConfigFile(ctx);
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    config.provider = {
        ...providersOf(config),
        [PROVIDER]: providerBlock(settings.models, settings.apiKey),
    };
    config.model = `${PROVIDER}/${settings.model}`;
    removeLegacyPlugin(config);
    writeJson(path, config);
    // The provider block above now carries the key.
    deleteLegacyKey(ctx);
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;

    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config !== null) {
        const providers = providersOf(config);
        if (isOurProvider(providers[PROVIDER])) {
            delete providers[PROVIDER];
            if (Object.keys(providers).length === 0) delete config.provider;
            else config.provider = providers;
            changed = true;
        }
        if (isOurModel(config.model)) {
            delete config.model;
            changed = true;
        }
        if (removeLegacyPlugin(config)) changed = true;
        if (changed) writeJson(path, config);
    }

    if (deleteLegacyKey(ctx)) changed = true;
    return changed;
};

const isOurModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const model = isOurModel(config.model)
        ? (config.model as string).slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            isOurProvider(providersOf(config)[PROVIDER]) &&
            isOurModel(config.model) &&
            readKey(ctx) !== null,
        model,
        files: files(ctx),
    };
};

export const configureOpenCode = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
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

export const opencode = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode to use Pollinations",
    restartHint:
        "Restart OpenCode, then pick a Pollinations model with /models. Run `polli mcp install opencode --all` to add the media tools.",

    async on(ctx, options) {
        if (!openCodeInstalled(ctx)) {
            throw new Error(
                "OpenCode was not found. Install it first: curl -fsSL https://opencode.ai/install | bash",
            );
        }
        const { model, models } = await fetchHarnessModels(
            options.model ?? DEFAULT_MODEL,
        );
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readKey(ctx) ?? legacyKey(ctx),
            },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
} satisfies HarnessAdapter;
