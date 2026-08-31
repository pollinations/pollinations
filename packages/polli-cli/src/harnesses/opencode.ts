import { join, resolve } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import { commandExists, readTextIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "opencode";
const LABEL = "OpenCode";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";
// The community-maintained plugin that adds Pollinations media tools, usage,
// and quests to OpenCode. It reads the API key from the provider block below,
// so no second login is required inside OpenCode.
const PLUGIN_SPEC = "opencode-pollinations-plugin";

export const openCodeConfigDir = (ctx: HarnessContext): string => {
    const custom = ctx.env.OPENCODE_CONFIG_DIR;
    if (!custom?.trim()) return join(ctx.home, ".config", "opencode");
    return resolve(custom);
};

const configPath = (ctx: HarnessContext) =>
    join(openCodeConfigDir(ctx), "opencode.json");

const files = (ctx: HarnessContext) => [configPath(ctx)];

const loadJson = (ctx: HarnessContext): Record<string, unknown> => {
    const text = readTextIfExists(configPath(ctx));
    if (!text?.trim()) return {};
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const saveJson = (ctx: HarnessContext, cfg: Record<string, unknown>) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(cfg, null, 2)}\n`);
};

// OpenAI-compatible provider config understood by OpenCode's AI SDK loader.
// The plugin reads `options.apiKey` from the same block, so Polli login serves
// both the chat provider and the plugin's media/quest tools.
const providerBlock = (apiKey: string, models: HarnessModel[]) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations.ai",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey,
    },
    models: Object.fromEntries(
        models.map((model) => [
            model.id,
            {
                name: model.id,
                limit: { context: model.contextWindow },
                ...(model.input.includes("image") ? { attachment: true } : {}),
                tool_call: true,
            },
        ]),
    ),
});

const addPlugin = (plugins: unknown): string[] => {
    const list = Array.isArray(plugins) ? [...(plugins as string[])] : [];
    if (
        !list.some(
            (entry) => typeof entry === "string" && entry.includes(PLUGIN_SPEC),
        )
    ) {
        list.push(PLUGIN_SPEC);
    }
    return list;
};

const removePlugin = (
    plugins: unknown,
): { list: string[]; changed: boolean } => {
    if (!Array.isArray(plugins)) return { list: [], changed: false };
    const before = plugins as string[];
    const list = before.filter(
        (entry) => typeof entry !== "string" || !entry.includes(PLUGIN_SPEC),
    );
    return { list, changed: list.length !== before.length };
};

interface OpenCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    plugin: boolean;
}

const writeConfig = (ctx: HarnessContext, settings: OpenCodeSettings) => {
    const cfg = loadJson(ctx);
    const existing =
        typeof cfg.provider === "object" && cfg.provider !== null
            ? (cfg.provider as Record<string, unknown>)
            : {};
    cfg.provider = {
        ...existing,
        [PROVIDER]: providerBlock(settings.apiKey, settings.models),
    };
    if (settings.plugin) cfg.plugin = addPlugin(cfg.plugin);
    cfg.model = `${PROVIDER}/${settings.model}`;
    saveJson(ctx, cfg);
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const cfg = loadJson(ctx);
    let changed = false;

    if (typeof cfg.provider === "object" && cfg.provider !== null) {
        const providers = cfg.provider as Record<string, unknown>;
        if (PROVIDER in providers) {
            const { [PROVIDER]: _removed, ...rest } = providers;
            if (Object.keys(rest).length > 0) cfg.provider = rest;
            else delete cfg.provider;
            changed = true;
        }
    }

    const { list, changed: pluginChanged } = removePlugin(cfg.plugin);
    if (pluginChanged) {
        if (list.length > 0) cfg.plugin = list;
        else delete cfg.plugin;
        changed = true;
    }

    if (typeof cfg.model === "string" && cfg.model.startsWith(`${PROVIDER}/`)) {
        delete cfg.model;
        changed = true;
    }

    if (changed) saveJson(ctx, cfg);
    return changed;
};

const readKey = (ctx: HarnessContext): string | null => {
    const cfg = loadJson(ctx);
    const provider = (cfg.provider as Record<string, unknown>)?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const options = provider?.options as Record<string, unknown> | undefined;
    const key = options?.apiKey;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const cfg = loadJson(ctx);
    const provider = (cfg.provider as Record<string, unknown>)?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const options = provider?.options as Record<string, unknown> | undefined;
    const configured =
        typeof options?.baseURL === "string" &&
        options.baseURL === `${BASE_URL}/v1` &&
        typeof options.apiKey === "string" &&
        (options.apiKey as string).length > 5;
    const prefix = `${PROVIDER}/`;
    const model =
        typeof cfg.model === "string" && cfg.model.startsWith(prefix)
            ? cfg.model.slice(prefix.length)
            : undefined;
    const hasPlugin =
        Array.isArray(cfg.plugin) &&
        (cfg.plugin as string[]).some(
            (entry) => typeof entry === "string" && entry.includes(PLUGIN_SPEC),
        );
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        mcp: hasPlugin,
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
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode as a Pollinations provider",
    restartHint: "Restart OpenCode for the changes to take effect.",

    async on(ctx, options) {
        if (!commandExists("opencode")) {
            printInfo(
                "OpenCode is not installed. Install it with:\n  npm install -g opencode-ai\nOr see https://opencode.ai/docs for other options.",
            );
        }

        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, {
            apiKey,
            model,
            models,
            plugin: options.mcp !== false,
        });
    },

    off: disableOpenCode,
    status: result,
};
