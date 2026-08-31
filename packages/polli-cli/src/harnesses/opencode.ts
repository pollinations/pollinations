import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
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
const PLUGIN_ID = "opencode-pollinations-plugin";
const CONFIG_DIR = ".config/opencode";
const CONFIG_FILE = "opencode.json";

const isOpencodeInstalled = (): boolean => {
    try {
        execSync("opencode --version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

const configPath = (ctx: HarnessContext) => join(ctx.home, CONFIG_DIR, CONFIG_FILE);
const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, CONFIG_DIR, "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

const readConfig = (ctx: HarnessContext): Record<string, unknown> => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) return {};
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(
            `${configPath(ctx)} is not valid JSON — fix or remove it and try again`,
        );
    }
};

const writeConfig = (config: Record<string, unknown>, ctx: HarnessContext) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(config, null, 2)}\n`, 0o600);
};

const ensureOpencodeInstalled = () => {
    if (isOpencodeInstalled()) return;
    const msg = [
        "OpenCode is not installed.",
        "Install it first with the official installer:",
        "  curl -fsSL https://opencode.ai/install | bash",
        "or: npm i -g opencode-ai",
        "Then run: polli harness opencode on",
    ].join("\n");
    throw new Error(msg);
};

const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    pollinations: {
        options: {
            baseURL: `${BASE_URL}/v1`,
            apiKey,
        },
        models: models.map((m) => ({
            id: m.id,
            name: m.id,
            contextWindow: m.contextWindow,
            input: m.input,
        })),
    },
});

interface OpencodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeOpencodeConfig = (ctx: HarnessContext, settings: OpencodeSettings) => {
    const config = readConfig(ctx);
    const provider = providerConfig(settings.models, settings.apiKey);

    // Preserve unrelated config — only touch our provider and plugin.
    const existingProvider = (config.provider ?? {}) as Record<string, unknown>;
    const existingPlugins = Array.isArray(config.plugin) ? [...(config.plugin as unknown[])] : [];

    // Merge provider.pollinations
    config.provider = {
        ...(config.provider as Record<string, unknown>),
        ...provider,
    };

    // Ensure plugin is enabled
    const hasPlugin = existingPlugins.some(
        (p) => p === PLUGIN_ID || (Array.isArray(p) && p[0] === PLUGIN_ID),
    );
    if (!hasPlugin) {
        config.plugin = [...existingPlugins, PLUGIN_ID];
    }

    // Default model
    if (!config.model || typeof config.model !== "string") {
        config.model = `${PROVIDER}/${settings.model}`;
    } else if (!String(config.model).startsWith(`${PROVIDER}/`)) {
        // Keep user's default if it's not pollinations, don't override
    } else {
        config.model = `${PROVIDER}/${settings.model}`;
    }

    writeConfig(config as Record<string, unknown>, ctx);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripOpencodeConfig = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return false;
    let config: Record<string, unknown>;
    try {
        config = JSON.parse(text) as Record<string, unknown>;
    } catch {
        return false;
    }
    let changed = false;

    const provider = config.provider as Record<string, unknown> | undefined;
    if (provider && PROVIDER in provider) {
        delete provider[PROVIDER];
        changed = true;
        if (Object.keys(provider).length === 0) delete config.provider;
    }

    if (Array.isArray(config.plugin)) {
        const before = (config.plugin as unknown[]).length;
        config.plugin = (config.plugin as unknown[]).filter(
            (p) => p !== PLUGIN_ID && !(Array.isArray(p) && p[0] === PLUGIN_ID),
        );
        if ((config.plugin as unknown[]).length !== before) changed = true;
        if ((config.plugin as unknown[]).length === 0) delete config.plugin;
    }

    if (typeof config.model === "string" && String(config.model).startsWith(`${PROVIDER}/`)) {
        delete config.model;
        changed = true;
    }

    if (changed) {
        const hasContent = Object.keys(config).length > 0;
        if (hasContent) writeConfig(config, ctx);
        else removeIfExists(configPath(ctx));
    }

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }

    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const provider = (config.provider as Record<string, unknown> | undefined)?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const options = provider?.options as Record<string, unknown> | undefined;
    const hasProvider = !!provider && options?.baseURL === `${BASE_URL}/v1` && typeof options?.apiKey === "string" && String(options.apiKey).length > 10;
    const model = typeof config.model === "string" ? String(config.model) : undefined;
    const hasPlugin = Array.isArray(config.plugin) && (config.plugin as unknown[]).some((p) => p === PLUGIN_ID || (Array.isArray(p) && p[0] === PLUGIN_ID));
    const hasSkill = readTextIfExists(skillPath(ctx)) !== null;

    return {
        harness: ID,
        label: LABEL,
        configured: hasProvider && hasPlugin && hasSkill,
        model: model?.startsWith(`${PROVIDER}/`) ? model.slice(PROVIDER.length + 1) : model,
        files: files(ctx),
    };
};

export const configureOpencode = (
    ctx: HarnessContext,
    settings: OpencodeSettings,
): HarnessResult => {
    ensureOpencodeInstalled();
    applyWithSnapshot(ctx, ID, files(ctx), () => writeOpencodeConfig(ctx, settings));
    return result(ctx);
};

export const disableOpencode = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripOpencodeConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode to use Pollinations",
    restartHint: "Run opencode again — the Pollinations provider is ready.",

    async on(ctx, options) {
        ensureOpencodeInstalled();
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(`Model "${model}" is not a tool-calling text model. Run: polli models`);
        }
        const existingKey = (() => {
            const cfg = readConfig(ctx);
            const provider = (cfg.provider as Record<string, unknown> | undefined)?.[PROVIDER] as Record<string, unknown> | undefined;
            const opts = provider?.options as Record<string, unknown> | undefined;
            return typeof opts?.apiKey === "string" ? String(opts.apiKey) : null;
        })();
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey },
            { browser: options.browser },
        );
        return configureOpencode(ctx, { apiKey, model, models });
    },

    off: disableOpencode,
    status: result,
};
