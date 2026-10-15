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
// The earlier setup: a 1.x-only plugin that 2.0 rejects.
const PLUGIN_SPEC = "opencode-pollinations-plugin";

/**
 * The `provider` block is the one config OpenCode 1.x and 2.0 both read, so
 * a single entry serves both. 2.0 does not read the key from 1.x's auth.json
 * for a custom provider, but both versions read `options.apiKey`.
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

const files = (ctx: HarnessContext) => [opencodeConfigFile(ctx)];

const readConfig = (ctx: HarnessContext): Record<string, unknown> => {
    const path = opencodeConfigFile(ctx);
    const text = readTextIfExists(path);
    if (text === null) return {};
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

const writeConfig = (ctx: HarnessContext, config: Record<string, unknown>) =>
    writeTextAtomic(
        opencodeConfigFile(ctx),
        `${JSON.stringify(config, null, 2)}\n`,
        0o600,
    );

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const isPluginEntry = (entry: unknown) =>
    typeof entry === "string"
        ? entry.includes(PLUGIN_SPEC)
        : Object.values(asRecord(entry)).some(
              (value) =>
                  typeof value === "string" && value.includes(PLUGIN_SPEC),
          );

const provider = (config: Record<string, unknown>) =>
    asRecord(asRecord(config.provider)[PROVIDER]);

const isOurs = (config: Record<string, unknown>) =>
    asRecord(provider(config).options).baseURL === `${BASE_URL}/v1`;

const isOurModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const readApiKey = (config: Record<string, unknown>): string | null => {
    const key = asRecord(provider(config).options).apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const model = isOurModel(config.model)
        ? (config.model as string).slice(PROVIDER.length + 1)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            isOurs(config) &&
            model !== undefined &&
            readApiKey(config) !== null,
        model,
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
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        const config = readConfig(ctx);
        if (typeof config.$schema !== "string") {
            config.$schema = "https://opencode.ai/config.json";
        }
        config.provider = {
            ...asRecord(config.provider),
            [PROVIDER]: {
                npm: "@ai-sdk/openai-compatible",
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
                            limit: { context: model.contextWindow, output: 0 },
                            modalities: {
                                input: model.input,
                                output: ["text"],
                            },
                        },
                    ]),
                ),
            },
        };
        config.model = `${PROVIDER}/${settings.model}`;
        // An earlier setup used a plugin, which 2.0 cannot load.
        for (const key of ["plugin", "plugins"]) {
            const plugins = config[key];
            if (!Array.isArray(plugins)) continue;
            const kept = plugins.filter((entry) => !isPluginEntry(entry));
            if (kept.length === 0) delete config[key];
            else config[key] = kept;
        }
        writeConfig(ctx, config);
    });
    return result(ctx);
};

export const disableOpenCode = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => {
        const config = readConfig(ctx);
        let changed = false;
        if (isOurs(config)) {
            const { [PROVIDER]: _ours, ...others } = asRecord(config.provider);
            if (Object.keys(others).length === 0) delete config.provider;
            else config.provider = others;
            changed = true;
        }
        if (isOurModel(config.model)) {
            delete config.model;
            changed = true;
        }
        if (changed) writeConfig(ctx, config);
        return changed;
    });
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
            { id: ID, label: LABEL, existingKey: readApiKey(readConfig(ctx)) },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
