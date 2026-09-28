import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import polliSkill from "../../SKILL.md?raw";
import { commandExists, readTextIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
// Hermes shows a custom provider as `custom:<name>`, so this is what the user
// sees in /model and in the status line.
const PROVIDER_NAME = "gen.pollinations.ai";
const BASE_URL = "https://gen.pollinations.ai/v1";
const INSTALL_HINT =
    "Install Hermes Agent first: https://github.com/NousResearch/hermes-agent";

interface ProviderEntry extends Record<string, unknown> {
    name?: string;
    api_key?: string;
    model?: string;
}

interface HermesConfig extends Record<string, unknown> {
    custom_providers?: ProviderEntry[];
    pollinations?: { api_key?: string };
}

/**
 * Hermes keeps its config under %LOCALAPPDATA%\hermes on Windows and ~/.hermes
 * elsewhere. HERMES_HOME wins when set, which is also what makes this testable.
 */
const hermesHome = (ctx: HarnessContext) => {
    if (ctx.env.HERMES_HOME) return ctx.env.HERMES_HOME;
    if (process.platform === "win32") {
        const local =
            ctx.env.LOCALAPPDATA ?? join(ctx.home, "AppData", "Local");
        return join(local, "hermes");
    }
    return join(ctx.home, ".hermes");
};

const configPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");

/** Exported so the MCP client adapter writes the same file this harness owns. */
export const hermesConfigPath = (ctx: {
    home: string;
    env: NodeJS.ProcessEnv;
}) => configPath(ctx as HarnessContext);

// Hermes loads every SKILL.md under <hermes-home>/skills/, so the polli skill
// lands next to the user's own skills without touching them.
const skillFile = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillFile(ctx)];

const readConfig = (ctx: HarnessContext): HermesConfig => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return {};
    const parsed = parse(text);
    return parsed && typeof parsed === "object" ? (parsed as HermesConfig) : {};
};

const providersOf = (config: HermesConfig): ProviderEntry[] =>
    Array.isArray(config.custom_providers)
        ? config.custom_providers.filter(
              (entry) => entry && typeof entry === "object",
          )
        : [];

/** The entry a previous `on` wrote, matched by name so wording can change. */
const pollinationsEntry = (config: HermesConfig): ProviderEntry | null =>
    providersOf(config).find((entry) => entry.name === PROVIDER_NAME) ?? null;

const installed = (ctx: HarnessContext) =>
    commandExists("hermes", ctx.env) || existsSync(configPath(ctx));

/**
 * The key already used for Pollinations, if any: the provider entry first —
 * `pollinations.api_key` is the section Hermes' own generation tools read.
 */
export const existingHermesKey = (ctx: HarnessContext): string | null => {
    const config = readConfig(ctx);
    const entry = pollinationsEntry(config);
    if (typeof entry?.api_key === "string" && entry.api_key) {
        return entry.api_key;
    }
    const section = config.pollinations?.api_key;
    return typeof section === "string" && section ? section : null;
};

/**
 * Add or replace the Pollinations provider, leaving every other provider and
 * every other top-level key exactly as it was.
 */
export const withPollinationsProvider = (
    config: HermesConfig,
    apiKey: string,
    model: string,
    modelIds: string[],
): HermesConfig => ({
    ...config,
    custom_providers: [
        ...providersOf(config).filter((entry) => entry.name !== PROVIDER_NAME),
        {
            name: PROVIDER_NAME,
            base_url: BASE_URL,
            api_key: apiKey,
            model,
            api_mode: "chat_completions",
            models: modelIds,
        },
    ],
    // Hermes' own Pollinations-aware tools read this section.
    pollinations: { ...(config.pollinations ?? {}), api_key: apiKey },
});

/** Remove only what we added, so `off` can run on a config edited since `on`. */
export const withoutPollinationsProvider = (
    config: HermesConfig,
): HermesConfig => {
    const next: HermesConfig = { ...config };
    const others = providersOf(config).filter(
        (entry) => entry.name !== PROVIDER_NAME,
    );
    if (others.length > 0) {
        next.custom_providers = others;
    } else {
        delete next.custom_providers;
    }

    const section = { ...(config.pollinations ?? {}) };
    delete section.api_key;
    if (Object.keys(section).length > 0) {
        next.pollinations = section;
    } else {
        delete next.pollinations;
    }
    return next;
};

export const hermesResult = (ctx: HarnessContext): HarnessResult => {
    const entry = pollinationsEntry(readConfig(ctx));
    const model = typeof entry?.model === "string" ? entry.model : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured: Boolean(entry?.api_key) && Boolean(model),
        model,
        files: files(ctx),
        installed: installed(ctx),
    };
};

const writeConfig = (ctx: HarnessContext, config: HermesConfig) =>
    writeTextAtomic(configPath(ctx), stringify(config), 0o600);

export const configureHermes = (
    ctx: HarnessContext,
    apiKey: string,
    model = DEFAULT_MODEL,
    modelIds: string[] = [],
) => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        writeConfig(
            ctx,
            withPollinationsProvider(readConfig(ctx), apiKey, model, modelIds),
        );
        // The polli skill, so Hermes knows the Pollinations-specific commands.
        writeTextAtomic(skillFile(ctx), polliSkill, 0o600);
    });
    return hermesResult(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => {
        const before = readConfig(ctx);
        const after = withoutPollinationsProvider(before);
        if (JSON.stringify(after) === JSON.stringify(before)) return false;
        writeConfig(ctx, after);
        return true;
    });
    return { ...hermesResult(ctx), configured: false, outcome };
};

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Hermes Agent to use authenticated Pollinations text models",
    restartHint: "Changes apply on the next Hermes session.",

    async on(ctx, options) {
        if (!installed(ctx)) {
            throw new Error(`Hermes Agent was not found. ${INSTALL_HINT}`);
        }
        const model = options.model ?? DEFAULT_MODEL;
        // The catalog is the only model list: fetchHarnessModels also rejects a
        // model Hermes could not actually drive.
        const modelIds = (await fetchHarnessModels(model)).map(
            (entry) => entry.id,
        );
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: existingHermesKey(ctx) },
            { browser: options.browser },
        );
        return configureHermes(ctx, apiKey, model, modelIds);
    },

    off: disableHermes,
    status: hermesResult,
};
