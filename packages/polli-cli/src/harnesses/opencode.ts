import { join } from "node:path";
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
const PROVIDER_ID = "pollinations";
const DEFAULT_MODEL = "openai";
const _KEY_ENV = "POLLI_OPENCODE_API_KEY";

const configDir = (ctx: HarnessContext) => {
    const configured = ctx.env.OPENCODE_CONFIG_DIR;
    if (!configured?.trim()) return join(ctx.home, ".config", "opencode");
    return configured;
};

const configPath = (ctx: HarnessContext) =>
    join(configDir(ctx), "opencode.json");

const authPath = (ctx: HarnessContext) =>
    join(ctx.home, ".local", "share", "opencode", "auth.json");

const skillDir = (ctx: HarnessContext) =>
    join(ctx.home, ".config", "opencode", "skills", "polli");

const skillPath = (ctx: HarnessContext) => join(skillDir(ctx), "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    authPath(ctx),
    skillPath(ctx),
];

interface OpenCodeConfig {
    $schema?: string;
    provider?: Record<string, unknown>;
    model?: string;
    [key: string]: unknown;
}

const readConfig = (ctx: HarnessContext): OpenCodeConfig => {
    const text = readTextIfExists(configPath(ctx));
    if (!text) return {};
    try {
        return JSON.parse(text) as OpenCodeConfig;
    } catch {
        return {};
    }
};

const writeConfig = (ctx: HarnessContext, config: OpenCodeConfig) => {
    writeTextAtomic(configPath(ctx), `${JSON.stringify(config, null, 2)}\n`);
};

const readKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(authPath(ctx));
    if (!text) return null;
    try {
        const auth = JSON.parse(text) as Record<string, string>;
        // OpenCode stores keys under provider IDs
        return auth[PROVIDER_ID] ?? auth.pollinations ?? null;
    } catch {
        return null;
    }
};

const writeKey = (ctx: HarnessContext, key: string) => {
    const existing = readTextIfExists(authPath(ctx));
    let auth: Record<string, string> = {};
    if (existing) {
        try {
            auth = JSON.parse(existing) as Record<string, string>;
        } catch {
            auth = {};
        }
    }
    auth[PROVIDER_ID] = key;
    writeTextAtomic(authPath(ctx), `${JSON.stringify(auth, null, 2)}\n`, 0o600);
};

const deleteKey = (ctx: HarnessContext): boolean => {
    const text = readTextIfExists(authPath(ctx));
    if (!text) return false;
    try {
        const auth = JSON.parse(text) as Record<string, string>;
        if (!(PROVIDER_ID in auth)) return false;
        delete auth[PROVIDER_ID];
        writeTextAtomic(
            authPath(ctx),
            `${JSON.stringify(auth, null, 2)}\n`,
            0o600,
        );
        return true;
    } catch {
        return false;
    }
};

const providerBlock = (models: HarnessModel[]) => ({
    npm: "@ai-sdk/openai-compatible",
    name: "Pollinations.ai",
    options: {
        baseURL: `${BASE_URL}/v1`,
    },
    models: Object.fromEntries(
        models.map((m) => [
            m.id,
            {
                name: m.id,
                ...(m.contextWindow ? { contextLength: m.contextWindow } : {}),
            },
        ]),
    ),
});

const writeProviderConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    model: string,
) => {
    const config = readConfig(ctx);
    config.$schema = "https://opencode.ai/config.json";
    config.provider = config.provider ?? {};
    (config.provider as Record<string, unknown>)[PROVIDER_ID] =
        providerBlock(models);
    config.model = `${PROVIDER_ID}/${model}`;
    writeConfig(ctx, config);
};

const stripProviderConfig = (ctx: HarnessContext): boolean => {
    const config = readConfig(ctx);
    if (!config.provider) return false;
    const providers = config.provider as Record<string, unknown>;
    if (!(PROVIDER_ID in providers)) return false;
    delete providers[PROVIDER_ID];
    if (Object.keys(providers).length === 0) delete config.provider;
    if (config.model?.startsWith(`${PROVIDER_ID}/`)) delete config.model;
    writeConfig(ctx, config);
    return true;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const config = readConfig(ctx);
    const providers = (config.provider ?? {}) as Record<string, unknown>;
    const provider = providers[PROVIDER_ID] as
        | Record<string, unknown>
        | undefined;
    const model = config.model;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider !== undefined &&
            provider.npm === "@ai-sdk/openai-compatible" &&
            readKey(ctx) !== null,
        model:
            typeof model === "string" && model.startsWith(`${PROVIDER_ID}/`)
                ? model.slice(`${PROVIDER_ID}/`.length)
                : undefined,
        files: files(ctx),
    };
};

const configureOpenCode = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; models: HarnessModel[] },
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        writeProviderConfig(ctx, settings.models, settings.model);
        writeKey(ctx, settings.apiKey);
        if (readTextIfExists(skillPath(ctx)) === null) {
            writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
        }
    });
    return result(ctx);
};

const disableOpenCode = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripProviderConfig(ctx) ? "stripped" : "unchanged";
        deleteKey(ctx);
        if (readTextIfExists(skillPath(ctx)) === polliSkill) {
            removeIfExists(skillPath(ctx));
            outcome = "stripped";
        }
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const opencode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure OpenCode as a Pollinations provider",
    restartHint:
        "Changes apply on the next request. Restart OpenCode to pick up the new provider.",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((c) => c.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureOpenCode(ctx, { apiKey, model, models });
    },

    off: disableOpenCode,
    status: result,
};
