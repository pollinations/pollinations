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
const PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";
const DEFAULT_MODEL = "openai/gpt-6-sol";
const LEGACY_PLUGIN = "opencode-pollinations-plugin";

/**
 * OpenCode 2.0 rejects the 1.x `opencode-pollinations-plugin` ("Plugin must
 * export a default definition with an id and an effect or setup function"),
 * so no Pollinations models appeared. Both 2.0 and 1.x read the same
 * `provider` block from the OpenCode config, so one config serves both:
 * register `pollinations` as an `@ai-sdk/openai-compatible` provider pointing
 * at the gen gateway and let OpenCode's own model plumbing replace the
 * plugin's. The key sits in that same block, so neither version needs a
 * separate credentials file.
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

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const isLegacyPluginEntry = (entry: unknown) =>
    typeof entry === "string"
        ? entry.includes(LEGACY_PLUGIN)
        : entry !== null &&
          typeof entry === "object" &&
          Object.values(entry).some(
              (value) =>
                  typeof value === "string" && value.includes(LEGACY_PLUGIN),
          );

/** Running `on` again replaces an earlier plugin setup. */
const removeLegacyPlugin = (config: Record<string, unknown>) => {
    for (const key of ["plugin", "plugins"] as const) {
        const entries = config[key];
        if (!Array.isArray(entries)) continue;
        const kept = entries.filter((entry) => !isLegacyPluginEntry(entry));
        if (kept.length === entries.length) continue;
        if (kept.length === 0) delete config[key];
        else config[key] = kept;
    }
};

const openCodeConfig = (ctx: HarnessContext): Record<string, unknown> =>
    readJson(opencodeConfigFile(ctx)) ?? {};

const providerEntry = (
    config: Record<string, unknown>,
): Record<string, unknown> | undefined => {
    const provider = asRecord(config.provider)[PROVIDER];
    return provider && typeof provider === "object"
        ? (provider as Record<string, unknown>)
        : undefined;
};

const readApiKey = (ctx: HarnessContext): string | null => {
    const key = providerEntry(openCodeConfig(ctx))?.options;
    const apiKey = asRecord(key).apiKey;
    return typeof apiKey === "string" && apiKey.length > 5 ? apiKey : null;
};

const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    npm: PROVIDER_PACKAGE,
    name: "Pollinations",
    options: {
        baseURL: `${BASE_URL}/v1`,
        apiKey,
    },
    models: Object.fromEntries(
        models.map((model) => [
            model.id,
            { name: model.id, attachment: model.input.includes("image") },
        ]),
    ),
});

const defaultModelRef = (model: string) => `${PROVIDER}/${model}`;

const isOurDefaultModel = (model: unknown) =>
    typeof model === "string" && model.startsWith(`${PROVIDER}/`);

const writeOpenCodeConfig = (
    ctx: HarnessContext,
    model: string,
    models: HarnessModel[],
    apiKey: string,
) => {
    const config = openCodeConfig(ctx);
    if (typeof config.$schema !== "string") {
        config.$schema = "https://opencode.ai/config.json";
    }
    removeLegacyPlugin(config);
    config.provider = {
        ...asRecord(config.provider),
        [PROVIDER]: providerConfig(models, apiKey),
    };
    config.model = defaultModelRef(model);
    writeJson(opencodeConfigFile(ctx), config);
};

const stripOpenCodeConfig = (ctx: HarnessContext) => {
    const path = opencodeConfigFile(ctx);
    const config = readJson(path);
    if (config === null) return false;
    let changed = false;

    const providers = asRecord(config.provider);
    if (PROVIDER in providers) {
        delete providers[PROVIDER];
        if (Object.keys(providers).length === 0) delete config.provider;
        else config.provider = providers;
        changed = true;
    }

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
        ? (config.model as string).slice(`${PROVIDER}/`.length)
        : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            providerEntry(config) !== undefined &&
            isOurDefaultModel(config.model) &&
            readApiKey(ctx) !== null,
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
    writeOpenCodeConfig(ctx, settings.model, settings.models, settings.apiKey);
};

const stripConfig = (ctx: HarnessContext) => stripOpenCodeConfig(ctx);

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
        "Restart OpenCode, then pick a Pollinations model with /models. Run `polli mcp install opencode --all` to add the Pollinations media tools.",

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
