import { join } from "node:path";
import { parseEnv } from "node:util";
import { parse, stringify, type TomlTable } from "smol-toml";
import polliSkill from "../../SKILL.md?raw";
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

const ID = "vibe";
const LABEL = "Mistral Vibe";
const PROVIDER = "pollinations";
const KEY_ENV = "POLLI_VIBE_API_KEY";
const DEFAULT_MODEL = "openai/gpt-6-sol";

export const vibeHome = (ctx: HarnessContext) =>
    ctx.env.VIBE_HOME?.trim()
        ? resolveHomePath(ctx.home, ctx.env.VIBE_HOME)
        : join(ctx.home, ".vibe");

const configPath = (ctx: HarnessContext) => join(vibeHome(ctx), "config.toml");
const envPath = (ctx: HarnessContext) => join(vibeHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(vibeHome(ctx), "skills", "polli", "SKILL.md");
const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

const loadConfig = (ctx: HarnessContext) => {
    try {
        return parse(readTextIfExists(configPath(ctx)) ?? "");
    } catch {
        // Parser excerpts can contain credentials from an existing config.
        throw new Error(
            `Cannot parse ${configPath(ctx)}; leaving it unchanged.`,
        );
    }
};

const entries = (config: TomlTable, field: "providers" | "models") => {
    const value = config[field] ?? [];
    if (
        !Array.isArray(value) ||
        value.some(
            (item) => !item || typeof item !== "object" || Array.isArray(item),
        )
    ) {
        throw new Error(`Vibe ${field} must be an array of TOML tables.`);
    }
    return value as TomlTable[];
};

const providerEntry = {
    name: PROVIDER,
    api_base: `${BASE_URL}/v1`,
    api_key_env_var: KEY_ENV,
    api_style: "openai",
    backend: "generic",
};
const ownsProvider = (provider: TomlTable) =>
    Object.entries(providerEntry).every(
        ([key, value]) => provider[key] === value,
    );
const modelAlias = (id: string) => `${PROVIDER}/${id}`;
const utilityModels = (config: TomlTable): TomlTable => {
    const value = config.utility_models ?? {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Vibe utility_models must be a TOML table.");
    }
    return value as TomlTable;
};
const readKey = (ctx: HarnessContext) =>
    ctx.env[KEY_ENV] ||
    parseEnv(readTextIfExists(envPath(ctx)) ?? "")[KEY_ENV] ||
    null;
const keyLine = new RegExp(`^\\s*(?:export\\s+)?${KEY_ENV}\\s*=`, "u");

const setKey = (ctx: HarnessContext, key: string | null) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null && key === null) return false;
    const lines = (text ?? "")
        .split("\n")
        .filter((line) => !keyLine.test(line));
    if (key !== null) {
        const index = lines.at(-1) === "" ? lines.length - 1 : lines.length;
        lines.splice(index, 0, `${KEY_ENV}=${JSON.stringify(key)}`);
    }
    const next = lines.join("\n");
    if (next === text) return false;
    writeTextAtomic(envPath(ctx), next, 0o600);
    return true;
};

interface VibeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const configuredDocument = (
    ctx: HarnessContext,
    settings: Pick<VibeSettings, "model" | "models">,
) => {
    const config = loadConfig(ctx);
    const providers = entries(config, "providers");
    const existing = providers.find((provider) => provider.name === PROVIDER);
    if (
        providers.some(
            (provider) => provider.name === PROVIDER && !ownsProvider(provider),
        )
    ) {
        throw new Error(
            "An existing pollinations provider has different settings; leaving it unchanged.",
        );
    }
    const models = entries(config, "models");
    const aliases = new Set(
        settings.models.map((model) => modelAlias(model.id)),
    );
    if (
        models.some(
            (model) =>
                aliases.has(String(model.alias)) && model.provider !== PROVIDER,
        )
    ) {
        throw new Error(
            "An existing Vibe model uses a Pollinations alias; leaving it unchanged.",
        );
    }
    config.providers = [
        ...providers.filter((provider) => provider.name !== PROVIDER),
        { ...existing, ...providerEntry },
    ];
    config.models = [
        ...models.filter((model) => model.provider !== PROVIDER),
        ...settings.models.map((model) => ({
            ...models.find(
                (entry) =>
                    entry.provider === PROVIDER &&
                    entry.alias === modelAlias(model.id),
            ),
            name: model.id,
            provider: PROVIDER,
            alias: modelAlias(model.id),
            max_context_length: model.contextWindow,
            supports_images: model.input.includes("image"),
        })),
    ];
    config.active_model = modelAlias(settings.model);
    // Explicit mappings also stop Vibe probing a Mistral fast model at startup.
    config.utility_models = {
        ...utilityModels(config),
        title: config.active_model,
        smart_approve: config.active_model,
    };
    return config;
};

const writeConfig = (ctx: HarnessContext, settings: VibeSettings) => {
    const config = configuredDocument(ctx, settings);
    writeTextAtomic(configPath(ctx), stringify(config), 0o600);
    setKey(ctx, settings.apiKey);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    const config = loadConfig(ctx);
    const providers = entries(config, "providers");
    if (!providers.some(ownsProvider)) return false;
    const models = entries(config, "models");
    const aliases = new Set(
        models
            .filter((model) => model.provider === PROVIDER)
            .map((model) => model.alias),
    );
    if (
        models.some(
            (model) =>
                model.provider === PROVIDER &&
                model.alias === config.active_model,
        )
    ) {
        delete config.active_model;
    }
    config.providers = providers.filter((provider) => !ownsProvider(provider));
    config.models = models.filter((model) => model.provider !== PROVIDER);
    const utilities = utilityModels(config);
    for (const key of ["title", "smart_approve"]) {
        if (aliases.has(utilities[key])) delete utilities[key];
    }
    if (Object.keys(utilities).length) config.utility_models = utilities;
    else delete config.utility_models;
    writeTextAtomic(configPath(ctx), stringify(config), 0o600);
    setKey(ctx, null);
    if (readTextIfExists(skillPath(ctx)) === polliSkill)
        removeIfExists(skillPath(ctx));
    return true;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = loadConfig(ctx);
    const model = entries(config, "models").find(
        (entry) =>
            entry.provider === PROVIDER && entry.alias === config.active_model,
    );
    return {
        harness: ID,
        label: LABEL,
        installed: commandExists("vibe", ctx.env),
        configured:
            entries(config, "providers").some(ownsProvider) &&
            Boolean(model && readKey(ctx)),
        model: typeof model?.name === "string" ? model.name : undefined,
        files: files(ctx),
    };
};

export const configureVibe = (ctx: HarnessContext, settings: VibeSettings) => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableVibe = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const vibe = {
    id: ID,
    label: LABEL,
    description: "Configure Mistral Vibe to use Pollinations",
    restartHint:
        "Start a new Vibe session with: vibe. Use /model to switch models. Project, agent, admin, and environment settings can override this user configuration.",
    async on(ctx, options) {
        if (!commandExists("vibe", ctx.env)) {
            throw new Error(
                "Mistral Vibe was not found. Install it first: uv tool install mistral-vibe",
            );
        }
        const { model, models } = await fetchHarnessModels(
            options.model ?? DEFAULT_MODEL,
        );
        // Reject invalid or conflicting config before resolving a new key.
        configuredDocument(ctx, { model, models });
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureVibe(ctx, { apiKey, model, models });
    },
    off: disableVibe,
    status: result,
} satisfies HarnessAdapter;
