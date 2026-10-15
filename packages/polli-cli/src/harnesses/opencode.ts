import { join } from "node:path";
import JSON5 from "json5";
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
import { BASE_URL } from "../lib/config.js";

const ID = "opencode";
const LABEL = "OpenCode";
const DEFAULT_MODEL = "openai/gpt-6-sol";
const PROVIDER = "pollinations";
const LEGACY_PLUGIN_SPEC = "opencode-pollinations-plugin";

/**
 * OpenCode 1.x and 2.x both read the 1.x `provider` block from the same
 * config file, so a plain `pollinations` provider with an OpenAI-compatible
 * base URL works in both. The previous integration enabled the 1.x-only
 * `opencode-pollinations-plugin`, which OpenCode 2.0 rejects, and stored the
 * key in the plugin's own config.json. We now write the provider + key into
 * the OpenCode config directly.
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

// The 1.x plugin kept its own config.json (apiKey). We no longer write it,
// but a setup created by an older polli still has both the plugin entry and
// this file; clean them up on `on` and `off`.
const legacyPluginConfigFile = (ctx: HarnessContext) =>
    join(pollinationsConfigDir(ctx), "config.json");

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

const legacyPluginEntry = (entry: unknown) =>
    typeof entry === "string"
        ? entry === LEGACY_PLUGIN_SPEC || entry.includes(LEGACY_PLUGIN_SPEC)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" && value.includes(LEGACY_PLUGIN_SPEC),
          );

const pluginListKey = (config: Record<string, unknown>) =>
    Array.isArray(config.plugins) && !Array.isArray(config.plugin)
        ? "plugins"
        : "plugin";

const removeLegacyPlugin = (
    config: Record<string, unknown>,
): boolean => {
    const key = pluginListKey(config);
    const entries = config[key];
    if (!Array.isArray(entries) || !entries.some(legacyPluginEntry)) {
        return false;
    }
    const filtered = entries.filter((entry) => !legacyPluginEntry(entry));
    if (filtered.length === 0) delete config[key];
    else config[key] = filtered;
    return true;
};

const providerConfig = (
    apiKey: string,
    models: HarnessModel[],
): Record<string, unknown> => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey,
    },
    models: Object.fromEntries(
        models.map((model) => [
            model.id,
            {
                name: model.id,
                limit: { context: model.contextWindow, output: 65536 },
            },
        ]),
    ),
});

const hasProvider = (config: Record<string, unknown>): boolean => {
    const provider = (config.provider as Record<string, unknown> | undefined)?.[
        PROVIDER
    ] as Record<string, unknown> | undefined;
    return (
        provider?.npm === "@ai-sdk/openai-compatible" &&
        typeof (
            provider.options as Record<string, unknown> | undefined
        )?.baseURL === "string" &&
        typeof (
            provider.options as Record<string, unknown> | undefined
        )?.apiKey === "string"
    );
};

const readApiKey = (ctx: HarnessContext): string | null => {
    const config = openCodeConfig(ctx);
    const provider = (config.provider as Record<string, unknown> | undefined)?.[
        PROVIDER
    ] as Record<string, unknown> | undefined;
    const apiKey = (
        provider?.options as Record<string, unknown> | undefined
    )?.apiKey;
    return typeof apiKey === "string" && apiKey.length > 5 ? apiKey : null;
};

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

const defaultModelRef = (model: string) => `${PROVIDER}/${model}`;

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    removeLegacyPlugin(config);
    removeIfExists(legacyPluginConfigFile(ctx));
    const providers = (config.provider as Record<string, unknown> | undefined) ??
        {};
    config.provider = {
        ...providers,
        [PROVIDER]: providerConfig(settings.apiKey, settings.models),
    };
    config.model = defaultModelRef(settings.model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext) => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = removeLegacyPlugin(config);

    const providers = config.provider as Record<string, unknown> | undefined;
    if (providers && PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0) delete config.provider;
        changed = true;
    }

    if (isOurDefaultModel(config.model)) {
        delete config.model;
        changed = true;
    }

    if (removeIfExists(legacyPluginConfigFile(ctx))) changed = true;

    if (changed) writeJson(path, config);
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const model = isOurDefaultModel(config.model)
        ? (config.model as string).slice(`${PROVIDER}/`.length)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            hasProvider(config) && isOurDefaultModel(config.model),
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
    writeOpenCodeConfig(ctx, settings);
};

const stripConfig = (ctx: HarnessContext) => stripOpenCodeConfig(ctx);

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
        "Restart OpenCode, then pick a Pollinations model with /models. Run 'polli mcp add opencode' for the media tools.",

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
