import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
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
const INSTALL_URL = "https://openclaw.ai/install";

const configPath = (ctx: HarnessContext) =>
    join(ctx.home, ".openclaw", "openclaw.json");
// Managed skills live under the OpenClaw state directory (~/.openclaw), one
// directory per skill.
const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, ".openclaw", "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

const loadJson = (ctx: HarnessContext): Record<string, unknown> => {
    const text = readTextIfExists(configPath(ctx));
    if (!text?.trim()) return {};
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const saveConfig = (ctx: HarnessContext, config: Record<string, unknown>) => {
    writeTextAtomic(
        configPath(ctx),
        `${JSON.stringify(config, null, 2)}\n`,
        0o600,
    );
};

const readKey = (ctx: HarnessContext): string | null => {
    const config = loadJson(ctx);
    const models = config.models as Record<string, unknown> | undefined;
    const providers = models?.providers as Record<string, unknown> | undefined;
    const provider = providers?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const apiKey = provider?.apiKey;
    return typeof apiKey === "string" && apiKey.length > 0 ? apiKey : null;
};

// Provider block in the current OpenClaw models schema: providers merge with
// the bundled catalog via models.mode = "merge", and the primary model ref is
// agents.defaults.model.primary (provider/model).
const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey,
    api: "openai-completions",
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        reasoning: false,
        input: model.input,
        contextWindow: model.contextWindow,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
});

interface OpenClawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: OpenClawSettings) => {
    const config = loadJson(ctx);
    const models = (config.models as Record<string, unknown> | undefined) ?? {};
    const providers =
        (models.providers as Record<string, unknown> | undefined) ?? {};
    providers[PROVIDER] = providerConfig(settings.models, settings.apiKey);
    models.providers = providers;
    // Only set mode when the user has not chosen one; both merge and replace
    // keep explicitly configured providers, so refusing to change an explicit
    // choice preserves existing behavior.
    if (models.mode === undefined) models.mode = "merge";
    config.models = models;

    const agents = (config.agents as Record<string, unknown> | undefined) ?? {};
    const defaults =
        (agents.defaults as Record<string, unknown> | undefined) ?? {};
    const model =
        typeof defaults.model === "object" && defaults.model !== null
            ? { ...(defaults.model as Record<string, unknown>) }
            : {};
    model.primary = `${PROVIDER}/${settings.model}`;
    defaults.model = model;
    agents.defaults = defaults;
    config.agents = agents;

    saveConfig(ctx, config);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(configPath(ctx));
    let changed = false;
    if (text) {
        let config: Record<string, unknown>;
        try {
            config = JSON.parse(text) as Record<string, unknown>;
        } catch {
            return false;
        }
        const models = config.models as Record<string, unknown> | undefined;
        if (models) {
            const providers = models.providers as
                | Record<string, unknown>
                | undefined;
            if (providers && PROVIDER in providers) {
                // Drop the whole provider block, including its apiKey.
                delete providers[PROVIDER];
                changed = true;
            }
            if (
                models.mode === "merge" &&
                Object.keys(providers ?? {}).length === 0
            ) {
                delete models.mode;
                changed = true;
            }
        }
        const agents = config.agents as Record<string, unknown> | undefined;
        const defaults = agents?.defaults as
            | Record<string, unknown>
            | undefined;
        const model = defaults?.model;
        const primary =
            typeof model === "string"
                ? model
                : (model as Record<string, unknown> | undefined)?.primary;
        if (typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)) {
            if (typeof model === "string") delete defaults!.model;
            else {
                const { primary: _removed, ...rest } = model as Record<
                    string,
                    unknown
                >;
                if (Object.keys(rest).length > 0) defaults!.model = rest;
                else delete defaults!.model;
            }
            changed = true;
        }
        if (changed) saveConfig(ctx, config);
    }
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = loadJson(ctx);
    const models = config.models as Record<string, unknown> | undefined;
    const providers = models?.providers as Record<string, unknown> | undefined;
    const provider = providers?.[PROVIDER] as
        | Record<string, unknown>
        | undefined;
    const agents = config.agents as Record<string, unknown> | undefined;
    const defaults = agents?.defaults as Record<string, unknown> | undefined;
    const model = defaults?.model;
    const primary =
        typeof model === "string"
            ? model
            : (model as Record<string, unknown> | undefined)?.primary;
    const configured =
        provider?.baseUrl === `${BASE_URL}/v1` &&
        provider?.api === "openai-completions" &&
        readKey(ctx) !== null &&
        typeof primary === "string" &&
        primary.startsWith(`${PROVIDER}/`) &&
        readTextIfExists(skillPath(ctx)) !== null;
    const modelName =
        typeof primary === "string" && primary.startsWith(`${PROVIDER}/`)
            ? primary.slice(PROVIDER.length + 1)
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured,
        model: modelName,
        files: files(ctx),
    };
};

export const configureOpenClaw = (
    ctx: HarnessContext,
    settings: OpenClawSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableOpenClaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw as a Pollinations provider",
    restartHint:
        "Run `openclaw gateway restart` for the new provider to take effect.",

    async on(ctx, options) {
        if (!commandExists("openclaw")) {
            printInfo(
                `OpenClaw is not installed. Install it with:\n  curl -fsSL ${INSTALL_URL}/install.sh | bash\nOr see ${INSTALL_URL} for other options.`,
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
        return configureOpenClaw(ctx, { apiKey, model, models });
    },

    off: disableOpenClaw,
    status: result,
};
