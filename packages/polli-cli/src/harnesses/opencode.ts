import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import { readTextIfExists, writeTextAtomic } from "./fs.js";
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
const PLUGIN_SPEC = "opencode-pollinations-plugin";
const INSTALL_URL = "https://opencode.ai/";

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

const providerBlock = (apiKey: string, models: HarnessModel[]) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations.ai",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey,
    },
    models: Object.fromEntries(
        models.map((m) => [
            m.id,
            {
                name: m.id,
                limit: { context: m.contextWindow },
                ...(m.input.includes("image") ? { attachment: true } : {}),
                tool_call: true,
            },
        ]),
    ),
});

const addPlugin = (plugins: unknown): string[] => {
    const list = Array.isArray(plugins) ? [...(plugins as string[])] : [];
    if (!list.some((p) => typeof p === "string" && p.includes(PLUGIN_SPEC)))
        list.push(PLUGIN_SPEC);
    return list;
};

const removePlugin = (
    plugins: unknown,
): { list: string[]; changed: boolean } => {
    if (!Array.isArray(plugins)) return { list: [], changed: false };
    const before = plugins as string[];
    const list = before.filter(
        (p) => typeof p !== "string" || !p.includes(PLUGIN_SPEC),
    );
    return { list, changed: list.length !== before.length };
};

interface OcSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    mcp?: boolean;
}

const writeConfig = (ctx: HarnessContext, s: OcSettings) => {
    const cfg = loadJson(ctx);
    const existing =
        typeof cfg.provider === "object" && cfg.provider !== null
            ? (cfg.provider as Record<string, unknown>)
            : {};
    cfg.provider = {
        ...existing,
        [PROVIDER]: providerBlock(s.apiKey, s.models),
    };
    if (s.mcp !== false) cfg.plugin = addPlugin(cfg.plugin);
    cfg.model = `${PROVIDER}/${s.model}`;
    saveJson(ctx, cfg);
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const cfg = loadJson(ctx);
    let changed = false;

    if (typeof cfg.provider === "object" && cfg.provider !== null) {
        const providers = cfg.provider as Record<string, unknown>;
        if (PROVIDER in providers) {
            const { [PROVIDER]: _, ...rest } = providers;
            cfg.provider = Object.keys(rest).length > 0 ? rest : undefined;
            changed = true;
        }
    }

    const { list, changed: pc } = removePlugin(cfg.plugin);
    if (pc) {
        cfg.plugin = list.length > 0 ? list : undefined;
        changed = true;
    }

    if (typeof cfg.model === "string" && cfg.model.startsWith(`${PROVIDER}/`)) {
        cfg.model = undefined;
        changed = true;
    }

    if (changed) {
        const clean = Object.fromEntries(
            Object.entries(cfg).filter(([, v]) => v !== undefined),
        );
        saveJson(ctx, clean);
    }
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

const hasPlugin = (ctx: HarnessContext): boolean => {
    const cfg = loadJson(ctx);
    return (
        Array.isArray(cfg.plugin) &&
        (cfg.plugin as string[]).some(
            (p) => typeof p === "string" && p.includes(PLUGIN_SPEC),
        )
    );
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
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        mcp: hasPlugin(ctx),
        files: files(ctx),
    };
};

// Check PATH without spawning a shell.
const isInstalled = (): boolean => {
    const pathEnv = process.env.PATH ?? "";
    const dirs = pathEnv.split(process.platform === "win32" ? ";" : ":");
    const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
    return dirs.some((dir) =>
        exts.some((ext) => existsSync(join(dir, `opencode${ext}`))),
    );
};

export const configureOpenCode = (
    ctx: HarnessContext,
    settings: OcSettings,
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
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        if (!isInstalled()) {
            printInfo(
                `OpenCode not found. Install it with: npm install -g opencode-ai`,
            );
            printInfo(`Or visit ${INSTALL_URL} for other install options.`);
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, {
            apiKey,
            model,
            models,
            mcp: options.mcp,
        });
    },

    off: disableOpenCode,
    status: result,
};
