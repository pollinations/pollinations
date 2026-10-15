import { join } from "node:path";
import JSON5 from "json5";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
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
// The official Pollinations OpenCode plugin is a 1.x plugin — OpenCode 2.x
// rejects it ("Plugin must export a default definition…"), so `on` now
// registers a provider instead. The spec is still used to REPLACE an
// earlier plugin setup and to strip leftover entries on `off`.
const PLUGIN_SPEC = "opencode-pollinations-plugin";
// The plugin served models as `enter/<id>` under its own provider; the
// provider registers them as plain Pollinations model ids.
const LEGACY_MODEL_PREFIX = "pollinations/enter/";

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

/**
 * OpenCode's plugin-era key store. Only read, for migrating a legacy setup:
 * the provider keeps its key in the OpenCode config itself.
 */
const pluginConfigFile = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        return join(ctx.env.APPDATA ?? ctx.home, "pollinations", "config.json");
    }
    if (process.platform === "darwin") {
        return join(
            ctx.home,
            "Library",
            "Application Support",
            "pollinations",
            "config.json",
        );
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "pollinations",
        "config.json",
    );
};

const files = (ctx: HarnessContext) => [opencodeConfigFile(ctx)];

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

const removePluginEntries = (config: Record<string, unknown>): boolean => {
    let changed = false;
    for (const key of ["plugin", "plugins"]) {
        const entries = config[key];
        if (Array.isArray(entries) && entries.some(isPluginEntry)) {
            const filtered = entries.filter((entry) => !isPluginEntry(entry));
            if (filtered.length === 0) delete config[key];
            else config[key] = filtered;
            changed = true;
        }
    }
    return changed;
};

const providerTable = (config: Record<string, unknown>) =>
    (config.provider as Record<string, unknown> | undefined) ?? {};

const readProvider = (ctx: HarnessContext): Record<string, unknown> | null => {
    const entry = providerTable(openCodeConfig(ctx))[PROVIDER];
    return entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
};

/** The model a `pollinations/…` reference selects, plugin-era or current. */
const ourModel = (model: unknown): string | undefined => {
    if (typeof model !== "string") return undefined;
    if (model.startsWith(LEGACY_MODEL_PREFIX))
        return model.slice(LEGACY_MODEL_PREFIX.length);
    if (model.startsWith(`${PROVIDER}/`))
        return model.slice(PROVIDER.length + 1);
    return undefined;
};

/**
 * The provider block is written in the V1 shape (`provider` table with
 * `npm` + `options`) that OpenCode 2.x still reads and normalizes in memory —
 * one config serves both generations, unlike 1.x-only plugins. The key rides
 * in `options.apiKey` because that is the one credential location both
 * generations read: 2.x does not pick up the V1 `auth.json` entry the plugin
 * era relied on.
 */
const providerConfig = (apiKey: string, models: HarnessModel[]) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey,
    },
    models: Object.fromEntries(
        models.map((model) => [model.id, { name: model.id }]),
    ),
});

const readApiKey = (ctx: HarnessContext): string | null => {
    const options = readProvider(ctx)?.options as
        | Record<string, unknown>
        | undefined;
    const key = options?.apiKey;
    if (typeof key === "string" && key.length > 5) return key;
    // Legacy plugin setup: reuse its key when moving to the provider.
    const legacy = readJson(pluginConfigFile(ctx))?.apiKey;
    return typeof legacy === "string" && legacy.length > 5 ? legacy : null;
};

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    // Replace an earlier plugin setup: 2.x rejects 1.x plugins outright.
    removePluginEntries(config);
    config.provider = {
        ...providerTable(config),
        [PROVIDER]: providerConfig(settings.apiKey, settings.models),
    };
    config.model = `${PROVIDER}/${settings.model}`;
    writeJson(opencodeConfigFile(ctx), config);
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = removePluginEntries(config);

    const providers = providerTable(config);
    if (PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0) delete config.provider;
        else config.provider = providers;
        changed = true;
    }

    if (ourModel(config.model) !== undefined) {
        delete config.model;
        changed = true;
    }

    if (changed) writeJson(path, config);
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const provider = readProvider(ctx);
    const options = provider?.options as Record<string, unknown> | undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider !== null &&
            options?.baseURL === `${BASE_URL}/v1` &&
            typeof options?.apiKey === "string" &&
            options.apiKey.length > 5 &&
            ourModel(config.model) !== undefined,
        model: ourModel(config.model),
        files: files(ctx),
    };
};

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

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
        "Restart OpenCode, then pick a Pollinations model with /models. Add the media tools with: polli mcp install opencode --all",

    async on(ctx, options) {
        if (!openCodeInstalled(ctx)) {
            throw new Error(
                "OpenCode was not found. Install it first: curl -fsSL https://opencode.ai/install | bash",
            );
        }
        // Keep the model an earlier setup selected — plugin (`enter/`) or
        // provider — when the caller does not ask for a specific one.
        const model =
            options.model ??
            ourModel(openCodeConfig(ctx).model) ??
            DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readApiKey(ctx) },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
