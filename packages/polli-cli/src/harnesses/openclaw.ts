import { join, resolve } from "node:path";
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

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";

// OpenClaw stores its config under OPENCLAW_HOME (default ~/.openclaw).
export const openclawHome = (ctx: HarnessContext) => {
    const configured = ctx.env.OPENCLAW_HOME;
    if (!configured?.trim()) return join(ctx.home, ".openclaw");
    const expanded =
        configured === "~"
            ? ctx.home
            : configured.startsWith("~/") || configured.startsWith("~\\")
              ? join(ctx.home, configured.slice(2))
              : configured;
    return resolve(expanded);
};
const configPath = (ctx: HarnessContext) =>
    join(openclawHome(ctx), "openclaw.json");
const envPath = (ctx: HarnessContext) => join(openclawHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(openclawHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

const readConfig = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (text === null) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const writeConfig = (path: string, config: Record<string, unknown>) => {
    writeTextAtomic(path, JSON.stringify(config, null, 2), 0o600);
};

// Build provider model entries from the harness model list. Mirrors the
// shape used in apps/openclaw/setup-pollinations.sh.
const providerModels = (models: HarnessModel[]) =>
    models.map((m) => ({
        id: m.id,
        name: m.id,
        contextWindow: m.contextWindow,
        maxTokens: 8192,
        input: m.input,
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }));

const providerConfig = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey: `SecretRef/${KEY_ENV}`,
    api: "openai-completions",
    models: providerModels(models),
});

const setEnvKey = (ctx: HarnessContext, key: string) => {
    const existing = readTextIfExists(envPath(ctx)) ?? "";
    const lines = existing.split("\n");
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        return !(
            trimmed.startsWith(`${KEY_ENV}=`) ||
            trimmed.startsWith(`export ${KEY_ENV}=`)
        );
    });
    const insertAt =
        filtered.length > 0 && filtered[filtered.length - 1] === ""
            ? filtered.length - 1
            : filtered.length;
    filtered.splice(insertAt, 0, `${KEY_ENV}=${JSON.stringify(key)}`);
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
};

const deleteEnvKey = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return false;
    const lines = text.split("\n");
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        return !(
            trimmed.startsWith(`${KEY_ENV}=`) ||
            trimmed.startsWith(`export ${KEY_ENV}=`)
        );
    });
    if (filtered.length === lines.length) return false;
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

const stripPollinationsFromConfig = (
    config: Record<string, unknown>,
): boolean => {
    let changed = false;

    // Remove the pollinations provider
    const providers = (config.models as Record<string, unknown> | undefined)
        ?.providers as Record<string, unknown> | undefined;
    if (providers && Object.hasOwn(providers, PROVIDER)) {
        delete providers[PROVIDER];
        changed = true;
    }

    // Remove the default model if it points at our provider
    const defaults = (
        (config.agents as Record<string, unknown> | undefined)?.defaults as
            | Record<string, unknown>
            | undefined
    )?.model as Record<string, unknown> | undefined;
    if (defaults && defaults.primary === `${PROVIDER}/${DEFAULT_MODEL}`) {
        delete defaults.primary;
        changed = true;
    }

    return changed;
};

interface WriteConfigSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writePollinationsConfig = (
    ctx: HarnessContext,
    settings: WriteConfigSettings,
) => {
    const path = configPath(ctx);
    const config = readConfig(path);

    // Insert provider (preserves all other providers)
    if (!config.models) config.models = {};
    const modelsRoot = config.models as Record<string, unknown>;
    if (!modelsRoot.providers) modelsRoot.providers = {};
    const providers = modelsRoot.providers as Record<string, unknown>;
    providers[PROVIDER] = providerConfig(settings.models);

    // Set default model (preserves other agent defaults)
    if (!config.agents) config.agents = {};
    const agents = config.agents as Record<string, unknown>;
    if (!agents.defaults) agents.defaults = {};
    const defaults = agents.defaults as Record<string, unknown>;
    if (!defaults.model) defaults.model = {};
    (defaults.model as Record<string, unknown>).primary =
        `${PROVIDER}/${settings.model}`;

    writeConfig(path, config);
    setEnvKey(ctx, settings.apiKey);

    // Write the polli skill if not already present
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripPollinationsConfig = (ctx: HarnessContext): boolean => {
    const path = configPath(ctx);
    const config = readConfig(path);
    let changed = stripPollinationsFromConfig(config);

    if (changed) writeConfig(path, config);
    changed = deleteEnvKey(ctx) || changed;

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const loadProvider = (config: Record<string, unknown>) => {
    const providers = (config.models as Record<string, unknown> | undefined)
        ?.providers as Record<string, unknown> | undefined;
    return providers?.[PROVIDER] as Record<string, unknown> | undefined;
};

const loadDefaultModel = (config: Record<string, unknown>): string | null => {
    const modelEntry = (
        (config.agents as Record<string, unknown> | undefined)?.defaults as
            | Record<string, unknown>
            | undefined
    )?.model as Record<string, unknown> | undefined;
    const primary = modelEntry?.primary;
    if (typeof primary !== "string") return null;
    return primary.startsWith(`${PROVIDER}/`)
        ? primary.slice(PROVIDER.length + 1)
        : null;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(configPath(ctx));
    const provider = loadProvider(config);
    const model = loadDefaultModel(config);

    const configured =
        provider !== undefined &&
        provider.baseUrl === `${BASE_URL}/v1` &&
        provider.apiKey === `SecretRef/${KEY_ENV}` &&
        provider.api === "openai-completions" &&
        model !== null &&
        readTextIfExists(envPath(ctx)) !== null &&
        readTextIfExists(skillPath(ctx)) !== null;

    return {
        harness: ID,
        label: LABEL,
        configured,
        model: model ?? undefined,
        files: files(ctx),
    };
};

export const configureOpenClaw = (
    ctx: HarnessContext,
    settings: WriteConfigSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writePollinationsConfig(ctx, settings),
    );
    return result(ctx);
};

export const disableOpenClaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripPollinationsConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw to use Pollinations.ai models",
    restartHint:
        "Changes apply on the next request. Start OpenClaw with: openclaw agent start",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: null },
            { browser: options.browser },
        );
        return configureOpenClaw(ctx, { apiKey, model, models });
    },

    off: disableOpenClaw,
    status: result,
};
