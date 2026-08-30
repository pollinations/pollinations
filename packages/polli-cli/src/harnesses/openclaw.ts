import { join } from "node:path";
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

const ID = "openclaw";
const LABEL = "OpenClaw";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "kimi";
const CONFIG_DIR = ".openclaw";
const CONFIG_FILE = "openclaw.json";

const isOpenClawInstalled = (): boolean => {
    try {
        execSync("openclaw --version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

const configPath = (ctx: HarnessContext) => join(ctx.home, CONFIG_DIR, CONFIG_FILE);
const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, ".openclaw", "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

type OpenClawConfig = {
    models?: {
        providers?: Record<string, unknown>;
        mode?: string;
    };
    agents?: {
        defaults?: Record<string, unknown>;
    };
};

const readConfig = (ctx: HarnessContext): OpenClawConfig => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) return {};
    try {
        return JSON.parse(text) as OpenClawConfig;
    } catch {
        throw new Error(
            `${configPath(ctx)} is not valid JSON — fix or remove it and try again`,
        );
    }
};

const writeConfig = (config: OpenClawConfig, ctx: HarnessContext) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(config, null, 2)}\n`, 0o600);
};

const ensureOpenClawInstalled = () => {
    if (isOpenClawInstalled()) return;
    const msg = [
        "OpenClaw is not installed.",
        "Install it first with:",
        "  curl -fsSL https://openclaw.ai/install.sh | bash",
        "Then run: polli harness openclaw on",
    ].join("\n");
    throw new Error(msg);
};

const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    baseUrl: `${BASE_URL}/v1`,
    apiKey,
    api: "openai-completions" as const,
    models: models.map((m) => ({
        id: m.id,
        name: m.id,
        contextWindow: m.contextWindow,
        input: m.input,
        reasoning: (m as unknown as Record<string, unknown>).reasoning ?? false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        maxTokens: 8192,
    })),
});

interface OpenClawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeOpenClawConfig = (ctx: HarnessContext, settings: OpenClawSettings) => {
    const config = readConfig(ctx);
    const pollinationsProvider = providerConfig(settings.models, settings.apiKey);

    config.models = config.models ?? {};
    config.models.providers = {
        ...(config.models.providers as Record<string, unknown>),
        [PROVIDER]: pollinationsProvider,
    };
    if (!config.models.mode) config.models.mode = "merge";

    // Preserve existing default model if not pollinations, otherwise set to requested.
    const defaults = (config.agents?.defaults ?? {}) as Record<string, unknown>;
    const currentPrimary = defaults.model as string | undefined;
    if (!currentPrimary || String(currentPrimary).startsWith(`${PROVIDER}/`)) {
        config.agents = config.agents ?? {};
        config.agents.defaults = {
            ...defaults,
            model: `${PROVIDER}/${settings.model}`,
        };
    }

    writeConfig(config, ctx);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripOpenClawConfig = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return false;
    let config: OpenClawConfig;
    try {
        config = JSON.parse(text) as OpenClawConfig;
    } catch {
        return false;
    }
    let changed = false;

    const providers = config.models?.providers as Record<string, unknown> | undefined;
    if (providers && PROVIDER in providers) {
        delete providers[PROVIDER];
        changed = true;
        if (Object.keys(providers).length === 0) delete config.models?.providers;
        if (config.models && Object.keys(config.models).length === 0) delete config.models;
    }

    const defaults = config.agents?.defaults as Record<string, unknown> | undefined;
    if (
        defaults &&
        typeof defaults.model === "string" &&
        String(defaults.model).startsWith(`${PROVIDER}/`)
    ) {
        delete defaults.model;
        changed = true;
        if (Object.keys(defaults).length === 0) {
            if (config.agents) delete config.agents.defaults;
            if (config.agents && Object.keys(config.agents).length === 0) delete config.agents;
        }
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
    const providers = config.models?.providers as Record<string, unknown> | undefined;
    const pollinations = providers?.[PROVIDER] as Record<string, unknown> | undefined;
    const optionsOk =
        !!pollinations &&
        typeof pollinations.baseUrl === "string" &&
        String(pollinations.baseUrl) === `${BASE_URL}/v1` &&
        typeof pollinations.apiKey === "string" &&
        String(pollinations.apiKey).length > 10;
    const hasSkill = readTextIfExists(skillPath(ctx)) !== null;
    const model = (config.agents?.defaults as Record<string, unknown> | undefined)?.model as string | undefined;

    return {
        harness: ID,
        label: LABEL,
        configured: !!optionsOk && hasSkill,
        model: model?.startsWith(`${PROVIDER}/`) ? model.slice(PROVIDER.length + 1) : model,
        files: files(ctx),
    };
};

export const configureOpenClaw = (
    ctx: HarnessContext,
    settings: OpenClawSettings,
): HarnessResult => {
    ensureOpenClawInstalled();
    applyWithSnapshot(ctx, ID, files(ctx), () => writeOpenClawConfig(ctx, settings));
    return result(ctx);
};

export const disableOpenClaw = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripOpenClawConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const openclaw: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenClaw to use Pollinations",
    restartHint: "Run openclaw again — the Pollinations provider is ready. Try /model pollinations/kimi",

    async on(ctx, options) {
        ensureOpenClawInstalled();
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(`Model "${model}" is not a tool-calling text model. Run: polli models`);
        }
        const existingKey = (() => {
            const cfg = readConfig(ctx);
            const prov = (cfg.models?.providers as Record<string, unknown> | undefined)?.[PROVIDER] as Record<string, unknown> | undefined;
            return typeof prov?.apiKey === "string" ? String(prov.apiKey) : null;
        })();
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey },
            { browser: options.browser },
        );
        return configureOpenClaw(ctx, { apiKey, model, models });
    },

    off: disableOpenClaw,
    status: result,
};
