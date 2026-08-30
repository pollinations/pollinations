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

const ID = "pi";
const LABEL = "Pi";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";
const CONFIG_DIR = ".pi/agent";
const CONFIG_FILE = "models.json";
const SKILL_DIR = ".pi/skills/polli";

const isPiInstalled = (): boolean => {
    try {
        execSync("pi --version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

const configPath = (ctx: HarnessContext) => join(ctx.home, CONFIG_DIR, CONFIG_FILE);
const skillPath = (ctx: HarnessContext) => join(ctx.home, SKILL_DIR, "SKILL.md");

const files = (ctx: HarnessContext) => [configPath(ctx), skillPath(ctx)];

type PiConfig = {
    providers?: Record<string, unknown>;
};

const readConfig = (ctx: HarnessContext): PiConfig => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) return {};
    try {
        return JSON.parse(text) as PiConfig;
    } catch {
        throw new Error(
            `${configPath(ctx)} is not valid JSON — fix or remove it and try again`,
        );
    }
};

const writeConfig = (config: PiConfig, ctx: HarnessContext) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(config, null, 2)}\n`, 0o600);
};

const ensurePiInstalled = () => {
    if (isPiInstalled()) return;
    const msg = [
        "Pi is not installed.",
        "Install it first with:",
        "  npm i -g @earendil-works/pi",
        "or see https://github.com/earendil-works/pi#installation",
        "Then run: polli harness pi on",
    ].join("\n");
    throw new Error(msg);
};

const providerConfig = (models: HarnessModel[], apiKey: string) => ({
    pollinations: {
        baseUrl: `${BASE_URL}/v1`,
        api: "openai-completions" as const,
        apiKey,
        compat: {
            supportsDeveloperRole: false,
            supportsReasoningEffort: true,
            supportsStore: false,
        },
        models: models.map((m) => ({
            id: m.id,
            name: m.id,
            contextWindow: m.contextWindow,
            input: m.input,
            reasoning: (m as unknown as Record<string, unknown>).reasoning ?? false,
        })),
    },
});

interface PiSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writePiConfig = (ctx: HarnessContext, settings: PiSettings) => {
    const config = readConfig(ctx);
    const providers = (config.providers ?? {}) as Record<string, unknown>;
    const pollinationsProvider = providerConfig(settings.models, settings.apiKey);

    // Preserve unrelated providers — only touch pollinations.
    config.providers = {
        ...providers,
        ...pollinationsProvider,
    };

    writeConfig(config, ctx);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripPiConfig = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(configPath(ctx));
    if (text === null) return false;
    let config: PiConfig;
    try {
        config = JSON.parse(text) as PiConfig;
    } catch {
        return false;
    }
    let changed = false;

    if (config.providers && PROVIDER in config.providers) {
        delete (config.providers as Record<string, unknown>)[PROVIDER];
        changed = true;
        if (Object.keys(config.providers).length === 0) delete config.providers;
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
    const providers = config.providers as Record<string, unknown> | undefined;
    const pollinations = providers?.[PROVIDER] as Record<string, unknown> | undefined;
    const optionsOk =
        !!pollinations &&
        typeof pollinations.baseUrl === "string" &&
        String(pollinations.baseUrl) === `${BASE_URL}/v1` &&
        typeof pollinations.apiKey === "string" &&
        String(pollinations.apiKey).length > 10;
    const hasSkill = readTextIfExists(skillPath(ctx)) !== null;
    const models = pollinations?.models as unknown[] | undefined;
    const modelCount = Array.isArray(models) ? models.length : 0;

    return {
        harness: ID,
        label: LABEL,
        configured: !!optionsOk && hasSkill && modelCount > 0,
        model: optionsOk ? (pollinations as Record<string, unknown>).model as string | undefined : undefined,
        files: files(ctx),
    };
};

export const configurePi = (
    ctx: HarnessContext,
    settings: PiSettings,
): HarnessResult => {
    ensurePiInstalled();
    applyWithSnapshot(ctx, ID, files(ctx), () => writePiConfig(ctx, settings));
    return result(ctx);
};

export const disablePi = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripPiConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const pi: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Pi to use Pollinations",
    restartHint: "Run pi again — the Pollinations provider is ready.",

    async on(ctx, options) {
        ensurePiInstalled();
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(`Model "${model}" is not a tool-calling text model. Run: polli models`);
        }
        const existingKey = (() => {
            const cfg = readConfig(ctx);
            const prov = (cfg.providers as Record<string, unknown> | undefined)?.[PROVIDER] as Record<string, unknown> | undefined;
            return typeof prov?.apiKey === "string" ? String(prov.apiKey) : null;
        })();
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey },
            { browser: options.browser },
        );
        return configurePi(ctx, { apiKey, model, models });
    },

    off: disablePi,
    status: result,
};
