import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import polliSkill from "../../SKILL.md?raw";
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
const PLUGIN_SPEC = "opencode-pollinations-plugin";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";
const POLLI_SKILL = polliSkill;

const opencodeHome = (ctx: HarnessContext) => {
    const configured = ctx.env.OPENCODE_CONFIG_DIR;
    if (configured?.trim()) return resolve(configured);
    return join(ctx.home, ".config", "opencode");
};

const configPath = (ctx: HarnessContext) =>
    join(opencodeHome(ctx), "opencode.json");

const pollinationsConfigDir = (ctx: HarnessContext) => {
    const home = ctx.home;
    const env = ctx.env;
    // Mirror plugin's getConfigDir cross-platform logic, but using ctx
    switch (process.platform) {
        case "win32":
            return join(env.APPDATA || home, "pollinations");
        case "darwin":
            return join(home, "Library", "Application Support", "pollinations");
        default:
            return join(
                env.XDG_CONFIG_HOME || join(home, ".config"),
                "pollinations",
            );
    }
};

const pollinationsConfigPath = (ctx: HarnessContext) =>
    join(pollinationsConfigDir(ctx), "config.json");

const skillPath = (ctx: HarnessContext) =>
    join(opencodeHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    pollinationsConfigPath(ctx),
    skillPath(ctx),
];

const loadOpencodeConfig = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (text === null) return {};
    // Strip JSONC comments (// and /* */) for lenient parsing
    const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
    try {
        return JSON.parse(stripped) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const saveOpencodeConfig = (path: string, config: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(config, null, 2)}\n`, 0o600);
};

const ensurePlugin = (config: Record<string, unknown>): boolean => {
    const rawPlugin = config.plugin;
    const rawPlugins = (config as Record<string, unknown>).plugins;
    let plugins: unknown[] = [];
    let key: "plugin" | "plugins" = "plugin";
    if (Array.isArray(rawPlugin)) {
        plugins = [...(rawPlugin as unknown[])];
        key = "plugin";
    } else if (Array.isArray(rawPlugins)) {
        plugins = [...(rawPlugins as unknown[])];
        key = "plugins";
    }
    const already = plugins.some((p) => {
        if (typeof p === "string")
            return (
                p === PLUGIN_SPEC || p.includes("opencode-pollinations-plugin")
            );
        if (p && typeof p === "object") {
            const id =
                (p as Record<string, unknown>).id ||
                (p as Record<string, unknown>).name ||
                (p as Record<string, unknown>).package ||
                "";
            return String(id).includes("opencode-pollinations-plugin");
        }
        return false;
    });
    if (!already) plugins.push(PLUGIN_SPEC);
    // Prefer singular "plugin" unless existing used "plugins"
    if (key === "plugins") {
        (config as Record<string, unknown>).plugins = plugins;
    } else {
        config.plugin = plugins;
        if ((config as Record<string, unknown>).plugins)
            delete (config as Record<string, unknown>).plugins;
    }
    return !already;
};

const removePlugin = (config: Record<string, unknown>): boolean => {
    let changed = false;
    for (const key of ["plugin", "plugins"] as const) {
        const value = (config as Record<string, unknown>)[key];
        if (!Array.isArray(value)) continue;
        const before = (value as unknown[]).length;
        const filtered = (value as unknown[]).filter((p) => {
            if (typeof p === "string")
                return !(
                    p === PLUGIN_SPEC ||
                    p.includes("opencode-pollinations-plugin")
                );
            if (p && typeof p === "object") {
                const id =
                    (p as Record<string, unknown>).id ||
                    (p as Record<string, unknown>).name ||
                    (p as Record<string, unknown>).package ||
                    "";
                return !String(id).includes("opencode-pollinations-plugin");
            }
            return true;
        });
        if (filtered.length !== before) {
            changed = true;
            if (filtered.length === 0)
                delete (config as Record<string, unknown>)[key];
            else (config as Record<string, unknown>)[key] = filtered;
        }
    }
    return changed;
};

const readPollinationsKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(pollinationsConfigPath(ctx));
    if (text === null) return null;
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const key = parsed.apiKey;
        return typeof key === "string" && key.length > 5 ? key : null;
    } catch {
        return null;
    }
};

const writePollinationsKey = (ctx: HarnessContext, apiKey: string) => {
    const path = pollinationsConfigPath(ctx);
    const existing = loadOpencodeConfig(path);
    // Preserve other pollinations config fields
    const next = {
        ...existing,
        apiKey,
        version: (existing.version as string) || "6.5.0",
    };
    writeTextAtomic(path, `${JSON.stringify(next, null, 2)}\n`, 0o600);
};

const deletePollinationsKey = (ctx: HarnessContext): boolean => {
    const path = pollinationsConfigPath(ctx);
    const text = readTextIfExists(path);
    if (text === null) return false;
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!("apiKey" in parsed)) return false;
        delete parsed.apiKey;
        // If only apiKey and version remain and no other meaningful keys, remove file
        const keys = Object.keys(parsed);
        if (keys.length === 0 || (keys.length === 1 && keys[0] === "version")) {
            removeIfExists(path);
        } else {
            writeTextAtomic(
                path,
                `${JSON.stringify(parsed, null, 2)}\n`,
                0o600,
            );
        }
        return true;
    } catch {
        return false;
    }
};

const isOpencodeInstalled = (): boolean => {
    const result = spawnSync("which", ["opencode"], { encoding: "utf-8" });
    if (result.status === 0) return true;
    // Fallback for systems without which
    const check = spawnSync("opencode", ["--version"], { encoding: "utf-8" });
    return check.status === 0;
};

const offerInstall = () => {
    // This is printed; the harness does not auto-install without explicit user action
    // but we provide the official experience
    const msg = [
        "OpenCode is not installed.",
        "Install with the official script:",
        "  curl -fsSL https://opencode.ai/install | bash",
        "or via npm:",
        "  npm install -g opencode-ai",
        "Then re-run: polli harness opencode on",
    ].join("\n");
    // Use console directly so it is visible even when harness is not verbose
    console.log(msg);
};

const pollinationsModelId = (model: string) => `${PROVIDER}/${model}`;

const writeConfig = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
) => {
    const path = configPath(ctx);
    const config = loadOpencodeConfig(path);
    ensurePlugin(config);
    config.model = pollinationsModelId(settings.model);
    // Keep unrelated config intact; do not add provider block — plugin provides it
    saveOpencodeConfig(path, config);
    writePollinationsKey(ctx, settings.apiKey);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), POLLI_SKILL, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;
    const path = configPath(ctx);
    const text = readTextIfExists(path);
    if (text !== null) {
        const config = loadOpencodeConfig(path);
        if (removePlugin(config)) changed = true;
        // Remove model if it points to pollinations provider
        if (
            typeof config.model === "string" &&
            (config.model as string).startsWith(`${PROVIDER}/`)
        ) {
            delete config.model;
            changed = true;
        }
        if (changed) {
            const keys = Object.keys(config);
            if (keys.length === 0) removeIfExists(path);
            else saveOpencodeConfig(path, config);
        }
    }
    if (deletePollinationsKey(ctx)) changed = true;
    if (readTextIfExists(skillPath(ctx)) === POLLI_SKILL) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = loadOpencodeConfig(configPath(ctx));
    const plugins =
        (config.plugin as unknown[]) ||
        ((config as Record<string, unknown>).plugins as unknown[]);
    const hasPlugin = Array.isArray(plugins)
        ? plugins.some((p) =>
              typeof p === "string"
                  ? p.includes("opencode-pollinations-plugin")
                  : p &&
                    typeof p === "object" &&
                    String(
                        (p as Record<string, unknown>).id ||
                            (p as Record<string, unknown>).name ||
                            "",
                    ).includes("opencode-pollinations-plugin"),
          )
        : false;
    const model = config.model as string | undefined;
    const pollinationsKey = readPollinationsKey(ctx);
    const skillExists = readTextIfExists(skillPath(ctx)) !== null;
    const configured =
        hasPlugin &&
        typeof model === "string" &&
        model.startsWith(`${PROVIDER}/`) &&
        pollinationsKey !== null &&
        skillExists;
    return {
        harness: ID,
        label: LABEL,
        configured,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configureOpencode = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableOpencode = (ctx: HarnessContext): HarnessResult => {
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
    restartHint: "Restart OpenCode to apply changes.",

    async on(ctx, options) {
        if (!isOpencodeInstalled()) {
            offerInstall();
            // Still proceed to configure so a new user can run `on` again after install
            // but ensure we don't fail silently — the config is still written
        }
        const models = await fetchHarnessModels();
        const requested = options.model ?? DEFAULT_MODEL;
        const chosen =
            models.find((m) => m.id === requested)?.id ??
            models.find((m) => m.id === DEFAULT_MODEL)?.id ??
            models[0]?.id;
        if (!chosen)
            throw new Error(
                "No compatible text models available. Run: polli models",
            );

        if (options.model && !models.some((m) => m.id === options.model)) {
            throw new Error(
                `Model "${options.model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readPollinationsKey(ctx) },
            { browser: options.browser },
        );
        return configureOpencode(ctx, { apiKey, model: chosen, models });
    },

    off: disableOpencode,
    status: result,
};
