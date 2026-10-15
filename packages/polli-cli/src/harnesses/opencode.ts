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
// The old setup: a 1.x-only plugin that 2.0 rejects.
const PLUGIN_SPEC = "opencode-pollinations-plugin";

/**
 * `provider` is the one block OpenCode 1.x and 2.0 both read, so a single
 * config serves both. The key lives in OpenCode's own auth.json (what
 * `opencode auth login` writes), never in the config file.
 */
const dataDir = (ctx: HarnessContext) => {
    const xdg = ctx.env.XDG_DATA_HOME?.trim();
    return join(
        xdg
            ? resolveHomePath(ctx.home, xdg)
            : join(ctx.home, ".local", "share"),
        "opencode",
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

const files = (ctx: HarnessContext) => [opencodeConfigFile(ctx), authFile(ctx)];

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
        ? entry.includes(PLUGIN_SPEC)
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

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const readApiKey = (ctx: HarnessContext): string | null => {
    const key = asRecord(readJson(authFile(ctx))?.[PROVIDER]).key;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const providerBlock = (models: HarnessModel[]) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations",
    options: { baseURL: `${BASE_URL}/v1` },
    models: Object.fromEntries(
        models.map((model) => [
            model.id,
            {
                name: model.id,
                limit: { context: model.contextWindow, output: 0 },
                modalities: { input: model.input, output: ["text"] },
            },
        ]),
    ),
});

const modelRef = (model: string) => `${PROVIDER}/${model}`;

const isOurModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const hasOurProvider = (config: Record<string, unknown>) =>
    asRecord(asRecord(asRecord(config.provider)[PROVIDER]).options).baseURL ===
    `${BASE_URL}/v1`;

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    config.provider = {
        ...asRecord(config.provider),
        [PROVIDER]: providerBlock(settings.models),
    };
    config.model = modelRef(settings.model);
    // A plugin setup from an earlier version of `on` cannot load in 2.0.
    const listKey = pluginListKey(config);
    const plugins = config[listKey];
    if (Array.isArray(plugins) && plugins.some(isPluginEntry)) {
        const kept = plugins.filter((entry) => !isPluginEntry(entry));
        if (kept.length === 0) delete config[listKey];
        else config[listKey] = kept;
    }
    writeJson(opencodeConfigFile(ctx), config);

    const auth = readJson(authFile(ctx)) ?? {};
    auth[PROVIDER] = { type: "api", key: settings.apiKey };
    writeJson(authFile(ctx), auth);
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = false;

    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config) {
        if (hasOurProvider(config)) {
            const { [PROVIDER]: _ours, ...others } = asRecord(config.provider);
            if (Object.keys(others).length === 0) delete config.provider;
            else config.provider = others;
            changed = true;
        }
        if (isOurModel(config.model)) {
            delete config.model;
            changed = true;
        }
        if (changed) writeJson(path, config);
    }

    const auth = readJson(authFile(ctx));
    if (auth && PROVIDER in auth) {
        delete auth[PROVIDER];
        if (Object.keys(auth).length === 0) removeIfExists(authFile(ctx));
        else writeJson(authFile(ctx), auth);
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = openCodeConfig(ctx);
    const model = isOurModel(config.model)
        ? (config.model as string).slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            hasOurProvider(config) &&
            model !== undefined &&
            readApiKey(ctx) !== null,
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
        "Restart OpenCode, then pick a Pollinations model with /models. For image, video and audio tools run: polli mcp install opencode --all",

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
            },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
