import { spawnSync } from "node:child_process";
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
const DEFAULT_MODEL = "openai/gpt-6-sol";
const PLUGIN_SPEC = "opencode-pollinations-plugin";
const PROVIDER_ID = "pollinations";
const PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";
const MODEL_PREFIX = `${PROVIDER_ID}/`;

/**
 * The plugin registers the `pollinations` provider on OpenCode 1.x, serves its
 * media tools, usage, and quest commands, and reads `apiKey` from its own
 * config.json. OpenCode 2.x rejects that plugin, so on 2.x no Pollinations
 * models appeared at all. 2.x still reads the 1.x `provider` block, so the
 * harness also writes a native provider entry: one config serves both versions.
 *
 * The provider block stays minimal on purpose. OpenCode 2.x drops a model whose
 * entry carries anything beyond `name`, and reports it as unavailable.
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

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    /** Catalog ids the provider block lists. Defaults to the selected model. */
    models?: string[];
    /** OpenCode major version; 2 and up resolve models natively. */
    major?: number;
}

/**
 * OpenCode 1.x resolves models through the plugin, which namespaces them as
 * `enter/<id>` and shadows the provider block. OpenCode 2.x rejects the plugin
 * and falls back to the provider block, so the default model has to match the
 * version that is installed.
 */
const usesNativeModels = (major: number | undefined) => (major ?? 1) >= 2;

/** Default model ref, e.g. `pollinations/openai/gpt-6-sol` on 2.x. */
const modelRef = (model: string, major: number | undefined) =>
    usesNativeModels(major)
        ? `${MODEL_PREFIX}${model}`
        : `${MODEL_PREFIX}enter/${model}`;

/** Major version of the installed OpenCode, or undefined when unreadable. */
const openCodeMajor = (ctx: HarnessContext): number | undefined => {
    const binary = commandExists("opencode", ctx.env)
        ? "opencode"
        : join(ctx.home, ".opencode", "bin", "opencode");
    const run = spawnSync(binary, ["--version"], {
        encoding: "utf8",
        env: ctx.env,
    });
    if (run.status !== 0) return undefined;
    // "opencode v2.0.26" and "1.19.0" both start with the major version.
    const match = `${run.stdout ?? ""}`.match(/(\d+)\./);
    return match ? Number.parseInt(match[1], 10) : undefined;
};

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(MODEL_PREFIX);

/**
 * Reads the model out of a ref we wrote, tolerating the `enter/` namespace the
 * plugin uses on 1.x.
 */
const modelFromRef = (ref: string) => {
    const legacy = `${MODEL_PREFIX}enter/`;
    return ref.startsWith(legacy)
        ? ref.slice(legacy.length)
        : ref.slice(MODEL_PREFIX.length);
};

const providerEntries = (config: Record<string, unknown>) => {
    const existing = config.provider;
    return existing !== null &&
        typeof existing === "object" &&
        !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
};

const isOurProvider = (entry: unknown) =>
    entry !== null &&
    typeof entry === "object" &&
    (entry as Record<string, unknown>).npm === PROVIDER_PACKAGE;

/**
 * OpenCode 2.x reads this 1.x provider block, but only keeps a minimal model
 * entry: a model that carries anything beyond `name` becomes unavailable. On
 * 1.x the plugin shadows this block, which is harmless.
 */
const writeProvider = (
    config: Record<string, unknown>,
    settings: OpenCodeSettings,
) => {
    const ids = settings.models?.length ? settings.models : [settings.model];
    config.provider = {
        ...providerEntries(config),
        [PROVIDER_ID]: {
            npm: PROVIDER_PACKAGE,
            name: "Pollinations",
            options: {
                baseURL: `${BASE_URL}/v1`,
                apiKey: settings.apiKey,
            },
            models: Object.fromEntries(ids.map((id) => [id, { name: id }])),
        },
    };
};

const stripProvider = (config: Record<string, unknown>) => {
    const entries = providerEntries(config);
    if (!isOurProvider(entries[PROVIDER_ID])) return false;

    const remaining = { ...entries };
    delete remaining[PROVIDER_ID];
    if (Object.keys(remaining).length === 0) delete config.provider;
    else config.provider = remaining;
    return true;
};

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    settings: OpenCodeSettings,
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    if (!hasPluginEntry(config)) {
        const key = pluginListKey(config);
        const entries = Array.isArray(config[key]) ? config[key] : [];
        config[key] = [...entries, PLUGIN_SPEC];
    }
    writeProvider(config, settings);
    config.model = modelRef(settings.model, settings.major);
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

    changed = stripProvider(config) || changed;

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
        ? modelFromRef(config.model as string)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            hasPluginEntry(config) &&
            isOurProvider(providerEntries(config)[PROVIDER_ID]) &&
            isOurDefaultModel(config.model) &&
            readApiKey(ctx) !== null,
        model,
        files: files(ctx),
    };
};

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    writeOpenCodeConfig(ctx, settings);
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
        const major = openCodeMajor(ctx);
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
        return configureOpenCode(ctx, {
            apiKey,
            model,
            models: models.map((entry) => entry.id),
            major,
        });
    },

    off: disableOpenCode,
    status: result,
};
