import { join } from "node:path";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { printInfo } from "../lib/output.js";
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

const ID = "prime";
const LABEL = "Prime Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const MCP_SERVER_ID = "pollinations";
const MCP_URL = `${BASE_URL}/mcp/pollinations`;
/** Prime accepts only env-var references for bearer secrets. */
const MCP_KEY_ENV = "POLLINATIONS_MCP_KEY_PRIME";

/** Prime Agent resolves its agent dir from this override, tilde included. */
export const primeAgentDir = (ctx: HarnessContext) => {
    const configured = ctx.env.PRIME_AGENT_CODING_AGENT_DIR;
    if (!configured?.trim()) return join(ctx.home, ".prime", "agent");
    return resolveHomePath(ctx.home, configured);
};
const modelsPath = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "models.json");
const authPath = (ctx: HarnessContext) => join(primeAgentDir(ctx), "auth.json");
const settingsPath = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "settings.json");
const skillPath = (ctx: HarnessContext) =>
    join(primeAgentDir(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    modelsPath(ctx),
    authPath(ctx),
    settingsPath(ctx),
    skillPath(ctx),
];

const loadJson = (path: string): Record<string, unknown> => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
};

const saveJson = (path: string, data: Record<string, unknown>) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
};

// Compat flags shared with the dsh provider block: gen.pollinations.ai/v1
// speaks standard completions without store/developer-role/strict-mode extras.
const compat = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

const providerEntry = (models: HarnessModel[]) => ({
    baseUrl: `${BASE_URL}/v1`,
    api: "openai-completions",
    // Prime validates custom providers before resolving their auth.json entry.
    apiKey: PROVIDER,
    compat,
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        input: model.input,
        contextWindow: model.contextWindow,
    })),
});

interface PrimeModels {
    providers?: Record<string, unknown>;
    [key: string]: unknown;
}

type PrimeAuth = Record<string, { type?: string; key?: string }>;

interface PrimeMcpServer {
    type?: string;
    url?: string;
    bearerTokenEnvVar?: string;
    [key: string]: unknown;
}

interface PrimeSettings {
    defaultProvider?: string;
    defaultModel?: string;
    mcpServers?: Record<string, PrimeMcpServer>;
    [key: string]: unknown;
}

const readKey = (ctx: HarnessContext) => {
    const auth = loadJson(authPath(ctx)) as PrimeAuth;
    const credential = auth[PROVIDER];
    return credential?.type === "api_key" && credential.key
        ? credential.key
        : null;
};

const writeAuth = (ctx: HarnessContext, apiKey: string) => {
    const auth = loadJson(authPath(ctx)) as PrimeAuth;
    auth[PROVIDER] = { type: "api_key", key: apiKey };
    saveJson(authPath(ctx), auth);
};

const deleteAuth = (ctx: HarnessContext) => {
    const auth = loadJson(authPath(ctx)) as PrimeAuth;
    if (!(PROVIDER in auth)) return false;
    delete auth[PROVIDER];
    if (Object.keys(auth).length === 0) removeIfExists(authPath(ctx));
    else saveJson(authPath(ctx), auth);
    return true;
};

/** Our Prime MCP entry: named pollinations, our hosted URL, env-var bearer. */
const mcpEntry = (settings: PrimeSettings): PrimeMcpServer | null => {
    const entry = settings?.mcpServers?.[MCP_SERVER_ID];
    if (!entry || entry.url !== MCP_URL) return null;
    return entry;
};

const writeMcpEntry = (settings: PrimeSettings) => {
    const servers = settings.mcpServers ?? {};
    servers[MCP_SERVER_ID] = {
        type: "http",
        url: MCP_URL,
        bearerTokenEnvVar: MCP_KEY_ENV,
    };
    settings.mcpServers = servers;
};

const stripMcpEntry = (settings: PrimeSettings): boolean => {
    if (!mcpEntry(settings)) return false;
    delete settings.mcpServers?.[MCP_SERVER_ID];
    if (Object.keys(settings.mcpServers ?? {}).length === 0) {
        delete settings.mcpServers;
    }
    return true;
};

const hasMcpEntry = (settings: PrimeSettings): boolean =>
    mcpEntry(settings) !== null;

const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
    mcp: boolean = true,
) => {
    const doc = loadJson(modelsPath(ctx)) as PrimeModels;
    const providers = (doc.providers ?? {}) as Record<string, unknown>;
    providers[PROVIDER] = providerEntry(models);
    doc.providers = providers;
    saveJson(modelsPath(ctx), doc);
    writeAuth(ctx, apiKey);

    const settings = loadJson(settingsPath(ctx)) as PrimeSettings;
    settings.defaultProvider = PROVIDER;
    settings.defaultModel = model;
    if (mcp) writeMcpEntry(settings);
    else stripMcpEntry(settings);
    saveJson(settingsPath(ctx), settings);

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    let changed = false;
    const doc = loadJson(modelsPath(ctx)) as PrimeModels;
    if (doc?.providers && PROVIDER in doc.providers) {
        delete doc.providers[PROVIDER];
        if (Object.keys(doc.providers).length === 0) delete doc.providers;
        saveJson(modelsPath(ctx), doc);
        changed = true;
    }
    changed = deleteAuth(ctx) || changed;

    const settings = loadJson(settingsPath(ctx)) as PrimeSettings;
    const hadDefault = settings?.defaultProvider === PROVIDER;
    if (hadDefault) {
        delete settings.defaultProvider;
        delete settings.defaultModel;
        changed = true;
    }
    const mcpChanged = stripMcpEntry(settings);
    if (hadDefault || mcpChanged) {
        saveJson(settingsPath(ctx), settings);
        changed = true;
    }

    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadJson(modelsPath(ctx)) as PrimeModels;
    const provider = doc?.providers?.[PROVIDER] as
        | { baseUrl?: string; api?: string; apiKey?: string }
        | undefined;
    const settings = loadJson(settingsPath(ctx)) as PrimeSettings;
    const model =
        settings?.defaultProvider === PROVIDER
            ? settings.defaultModel
            : undefined;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.baseUrl === `${BASE_URL}/v1` &&
            provider?.api === "openai-completions" &&
            provider?.apiKey === PROVIDER &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: typeof model === "string" ? model : undefined,
        mcp: hasMcpEntry(settings),
        files: files(ctx),
    };
};

export const configurePrime = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
    mcp: boolean = true,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, models, apiKey, model, mcp),
    );
    return result(ctx);
};

export const disablePrime = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const prime: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a custom provider in Prime Agent",
    restartHint:
        "Models reload when you open /model. Start Prime Agent with: prime-agent",

    async on(ctx, options) {
        if (!commandExists("prime-agent", ctx.env)) {
            throw new Error(
                "Prime Agent was not found. Install it first: curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        const configured = configurePrime(
            ctx,
            models,
            apiKey,
            model,
            options.mcp !== false,
        );
        if (options.mcp !== false) {
            printInfo(
                `Prime reads the MCP bearer token from an env var — add to your shell profile:\n  export ${MCP_KEY_ENV}="${apiKey}"`,
            );
        }
        return configured;
    },

    off: disablePrime,
    status: result,
};
