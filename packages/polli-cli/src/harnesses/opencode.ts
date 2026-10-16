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
const PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";
/**
 * The 1.x-only plugin that earlier `polli harness opencode on` releases wired
 * in. OpenCode 2.0 rejects its definition, and the provider below serves both
 * versions, so a fresh `on` retires it and `off` keeps cleaning it up.
 */
const PLUGIN_SPEC = "opencode-pollinations-plugin";

/**
 * OpenCode reads the same `provider` block in 1.x and 2.0, so one config
 * serves both. `on` writes a `pollinations` provider backed by
 * `@ai-sdk/openai-compatible` (1.x `npm` key, normalized by 2.0), lists the
 * tool-calling Pollinations models fetched at setup, stores the dedicated key
 * in the provider options both versions pass to the package, and points the
 * default model at it. Media tools now come from `polli mcp`.
 */
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

const legacyPluginConfigFile = (ctx: HarnessContext) => {
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

const files = (ctx: HarnessContext) => [
    opencodeConfigFile(ctx),
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

const isPluginEntry = (entry: unknown) =>
    typeof entry === "string"
        ? entry === PLUGIN_SPEC || entry.includes(PLUGIN_SPEC)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" && value.includes(PLUGIN_SPEC),
          );

const pluginListKeys = ["plugins", "plugin"] as const;

const stripPluginEntries = (config: Record<string, unknown>): boolean => {
    let changed = false;
    for (const key of pluginListKeys) {
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

type ProviderTable = Record<string, Record<string, unknown>>;

const providerTable = (
    config: Record<string, unknown>,
): ProviderTable | null => {
    const table = config.provider;
    if (table === undefined) return {};
    if (table === null || typeof table !== "object" || Array.isArray(table)) {
        return null;
    }
    return table as ProviderTable;
};

const providerConfig = (settings: OpenCodeSettings) => ({
    npm: PROVIDER_PACKAGE,
    name: "Pollinations",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey: settings.apiKey,
    },
    models: Object.fromEntries(
        settings.models.map((model) => [
            model.id,
            {
                name: model.id,
                limit: model.contextWindow,
                tool: true,
            },
        ]),
    ),
});

const isOurProvider = (provider: unknown): boolean => {
    if (provider === null || typeof provider !== "object") return false;
    const entry = provider as Record<string, unknown>;
    const options = entry.options as Record<string, unknown> | undefined;
    return (
        entry.npm === PROVIDER_PACKAGE &&
        options?.baseURL === `${BASE_URL}/v1` &&
        typeof options?.apiKey === "string" &&
        options.apiKey.length > 5
    );
};

const modelRef = (model: string) => `${PROVIDER}/${model}`;

// Model refs written by the retired 1.x plugin setup keep their own prefix
// so a legacy-only setup never reads as configured.
const legacyModelPrefix = `${PROVIDER}/enter/`;

const isOurModelRef = (model: unknown) =>
    typeof model === "string" &&
    model.startsWith(`${PROVIDER}/`) &&
    !model.startsWith(legacyModelPrefix);

const readApiKey = (ctx: HarnessContext): string | null => {
    const config = readJson(opencodeConfigFile(ctx));
    const provider = config ? providerTable(config)?.[PROVIDER] : undefined;
    if (isOurProvider(provider)) {
        const options = (provider as Record<string, unknown>).options as Record<
            string,
            unknown
        >;
        if (typeof options.apiKey === "string" && options.apiKey.length > 5) {
            return options.apiKey;
        }
    }
    // Fall back to the key stored by the retired 1.x plugin setup.
    const key = readJson(legacyPluginConfigFile(ctx))?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const retireLegacyKey = (ctx: HarnessContext): boolean => {
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

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    const providers = providerTable(config);
    if (providers === null) {
        throw new Error(
            `OpenCode config at ${opencodeConfigFile(
                ctx,
            )} must contain a "provider" object`,
        );
    }
    stripPluginEntries(config);
    config.provider = {
        ...providers,
        [PROVIDER]: providerConfig(settings),
    };
    config.model = modelRef(settings.model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext): boolean => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = false;

    if (stripPluginEntries(config)) changed = true;

    const providers = providerTable(config);
    if (providers !== null && PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0) delete config.provider;
        else config.provider = providers;
        changed = true;
    }

    if (
        isOurModelRef(config.model) ||
        (typeof config.model === "string" &&
            config.model.startsWith(legacyModelPrefix))
    ) {
        delete config.model;
        changed = true;
    }

    if (changed) writeJson(path, config);
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const providers = providerTable(config);
    const hasProvider = isOurProvider(providers?.[PROVIDER]);
    const model = isOurModelRef(config.model)
        ? (config.model as string).slice(`${PROVIDER}/`.length)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured: hasProvider && isOurModelRef(config.model),
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
    retireLegacyKey(ctx);
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = stripOpenCodeConfig(ctx);
    changed = retireLegacyKey(ctx) || changed;
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
        "Restart OpenCode, then pick a Pollinations model with /models. Add the media tools with: polli mcp install opencode --all",

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
