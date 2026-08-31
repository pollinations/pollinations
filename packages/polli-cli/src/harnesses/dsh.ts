import { join } from "node:path";
import { parseEnv } from "node:util";
import { isMap, isSeq, parseDocument, Scalar } from "yaml";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import {
    readTextIfExists,
    removeIfExists,
    resolveHarnessPath,
    writeTextAtomic,
} from "./fs.js";
import {
    isHarnessKeyValid,
    normalizeSecretKey,
    resolveHarnessKey,
    withHarnessKeyLease,
} from "./keys.js";
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

const ID = "dsh";
const LABEL = "DeepSeek Harness";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";
const KEY_ENV = "POLLI_DSH_API_KEY";
const MCP_ID = "mcp-pollinations";
const MCP_URL = `${BASE_URL}/mcp/pollinations`;
const PROVIDER_PATH = ["llm-pi-ai", "providers", PROVIDER];
const DEFAULT_MODEL_PATH = ["agent-default-model"];
// Never fold long scalars (the API key) across lines.
const YAML_OUT = { lineWidth: 0 };
const JS_TAG = {
    tag: "tag:yaml.org,2002:js",
    resolve: (value: string) => value,
};

export const dshHome = (ctx: HarnessContext) => {
    const configured = ctx.env.DSH_HOME;
    if (!configured?.trim()) return join(ctx.home, ".dsh");
    return resolveHarnessPath(configured, ctx.home);
};
const settingsPath = (ctx: HarnessContext) =>
    join(dshHome(ctx), "settings.yaml");
const envPath = (ctx: HarnessContext) => join(dshHome(ctx), ".env");
const patchPath = (ctx: HarnessContext) =>
    join(dshHome(ctx), "cordis.patch.yml");
const skillPath = (ctx: HarnessContext) =>
    join(dshHome(ctx), "skills", "polli", "SKILL.md");

// parseDocument keeps comments and untouched entries intact on rewrite.
const loadYaml = (path: string) =>
    parseDocument(readTextIfExists(path) ?? "", { customTags: [JS_TAG] });

const files = (ctx: HarnessContext) => [
    settingsPath(ctx),
    envPath(ctx),
    patchPath(ctx),
    skillPath(ctx),
];

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    return normalizeSecretKey(parseEnv(text)[KEY_ENV]);
};

const envLine = (key: string) => `${KEY_ENV}=${JSON.stringify(key)}`;
const keyLine = new RegExp(`^\\s*(?:export\\s+)?${KEY_ENV}\\s*=`, "u");

const setEnvKey = (ctx: HarnessContext, key: string) => {
    const lines = (readTextIfExists(envPath(ctx)) ?? "").split("\n");
    const index = lines.findIndex((line) => keyLine.test(line));
    const filtered = lines.filter(
        (line, i) => i === index || !keyLine.test(line),
    );
    if (index === -1) {
        const insertAt =
            filtered.at(-1) === "" ? filtered.length - 1 : filtered.length;
        filtered.splice(insertAt, 0, envLine(key));
    } else filtered[index] = envLine(key);
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
};

const deleteEnvKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return false;
    const lines = text.split("\n");
    const filtered = lines.filter((line) => !keyLine.test(line));
    if (filtered.length === lines.length) return false;
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

const stripMcpEntry = (doc: ReturnType<typeof loadYaml>) => {
    if (!isSeq(doc.contents)) return false;
    let changed = false;
    for (let i = doc.contents.items.length - 1; i >= 0; i--) {
        const patch = doc.contents.items[i];
        if (!isMap(patch)) continue;
        const inserted = patch.get("insert", true);
        if (!isSeq(inserted)) continue;
        const before = inserted.items.length;
        inserted.items = inserted.items.filter(
            (entry) => !isMap(entry) || entry.get("id") !== MCP_ID,
        );
        changed ||= inserted.items.length !== before;
        if (inserted.items.length === 0 && patch.items.length === 1) {
            doc.contents.items.splice(i, 1);
        }
    }
    return changed;
};

const removeMcpEntry = (ctx: HarnessContext) => {
    const doc = loadYaml(patchPath(ctx));
    if (!stripMcpEntry(doc)) return false;
    writeTextAtomic(patchPath(ctx), doc.toString(YAML_OUT), 0o600);
    return true;
};

const writeMcpEntry = (ctx: HarnessContext) => {
    const doc = loadYaml(patchPath(ctx));
    if (doc.contents === null) doc.contents = doc.createNode([]);
    if (!isSeq(doc.contents)) {
        throw new Error(`${patchPath(ctx)} must contain a YAML list`);
    }
    stripMcpEntry(doc);
    const authorization = doc.createNode(
        `\`Bearer \${process.env.${KEY_ENV}}\``,
    );
    authorization.tag = "tag:yaml.org,2002:js";
    authorization.type = Scalar.QUOTE_SINGLE;
    doc.add({
        insert: [
            {
                id: MCP_ID,
                name: "@deepseek-ai/dsh-mcp-client",
                config: {
                    serverName: "pollinations",
                    transport: "streamable-http",
                    url: MCP_URL,
                    headers: { Authorization: authorization },
                },
            },
        ],
    });
    writeTextAtomic(patchPath(ctx), doc.toString(YAML_OUT), 0o600);
};

const hasMcpEntry = (ctx: HarnessContext) => {
    const doc = loadYaml(patchPath(ctx));
    if (!isSeq(doc.contents)) return false;
    return doc.contents.items.some((patch) => {
        if (!isMap(patch)) return false;
        const inserted = patch.get("insert", true);
        return (
            isSeq(inserted) &&
            inserted.items.some(
                (entry) =>
                    isMap(entry) &&
                    entry.get("id") === MCP_ID &&
                    entry.getIn(["config", "url"]) === MCP_URL,
            )
        );
    });
};

// Provider block in the pi-ai schema dsh shares with Pi and Prime Agent. The
// compat flags match what gen.pollinations.ai/v1 accepts.
const providerConfig = (models: HarnessModel[]) => ({
    displayName: "Pollinations.ai",
    apiKeyEnv: KEY_ENV,
    api: "openai-completions",
    baseURL: `${BASE_URL}/v1`,
    compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
        supportsStrictMode: false,
        maxTokensField: "max_tokens",
    },
    models: models.map((model) => ({
        id: model.id,
        name: model.id,
        contextWindow: model.contextWindow,
        input: model.input,
        reasoningEfforts: false,
    })),
});

interface DshSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
    mcp?: boolean;
}

const writeConfig = (ctx: HarnessContext, settings: DshSettings) => {
    const doc = loadYaml(settingsPath(ctx));
    doc.setIn(PROVIDER_PATH, doc.createNode(providerConfig(settings.models)));
    doc.setIn(
        DEFAULT_MODEL_PATH,
        doc.createNode({ provider: PROVIDER, model: settings.model }),
    );
    writeTextAtomic(settingsPath(ctx), doc.toString(YAML_OUT), 0o600);
    // DSH's provider and MCP loader both read its user environment layer.
    setEnvKey(ctx, settings.apiKey);
    if (settings.mcp === false) removeMcpEntry(ctx);
    else writeMcpEntry(ctx);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadYaml(settingsPath(ctx));
    let changed = false;
    if (doc.hasIn(PROVIDER_PATH)) {
        doc.deleteIn(PROVIDER_PATH);
        changed = true;
    }
    if (doc.getIn([...DEFAULT_MODEL_PATH, "provider"]) === PROVIDER) {
        doc.deleteIn(DEFAULT_MODEL_PATH);
        changed = true;
    }
    if (changed)
        writeTextAtomic(settingsPath(ctx), doc.toString(YAML_OUT), 0o600);

    changed = deleteEnvKey(ctx) || changed;
    changed = removeMcpEntry(ctx) || changed;
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(settingsPath(ctx));
    const model = doc.getIn([...DEFAULT_MODEL_PATH, "model"]);
    return {
        harness: ID,
        label: LABEL,
        configured:
            doc.getIn([...PROVIDER_PATH, "apiKeyEnv"]) === KEY_ENV &&
            doc.getIn([...PROVIDER_PATH, "api"]) === "openai-completions" &&
            doc.getIn([...PROVIDER_PATH, "baseURL"]) === `${BASE_URL}/v1` &&
            doc.getIn([...DEFAULT_MODEL_PATH, "provider"]) === PROVIDER &&
            typeof model === "string" &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: typeof model === "string" ? model : undefined,
        mcp: hasMcpEntry(ctx),
        files: files(ctx),
    };
};

export const configureDsh = (
    ctx: HarnessContext,
    settings: DshSettings,
): HarnessResult => {
    const apiKey = normalizeSecretKey(settings.apiKey);
    if (!apiKey) throw new Error("A Pollinations secret API key is required");
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, { ...settings, apiKey }),
    );
    return result(ctx);
};

export const disableDsh = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const dsh: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure DeepSeek Harness as a Pollinations provider",
    supportsMcp: true,
    restartHint:
        "Changes apply on the next request. Start DeepSeek Harness with: npx @deepseek-ai/dsh web",

    async on(ctx, options) {
        const model = options.model ?? DEFAULT_MODEL;
        const existingKey = readKey(ctx);
        if (existingKey && (await isHarnessKeyValid(existingKey))) {
            const models = await fetchHarnessModels(existingKey);
            if (!models.some((candidate) => candidate.id === model)) {
                throw new Error(
                    `Model "${model}" is not a tool-calling text model. Run: polli models`,
                );
            }
            return configureDsh(ctx, {
                apiKey: existingKey,
                model,
                models,
                mcp: options.mcp,
            });
        }
        const publicModels = await fetchHarnessModels();
        if (!publicModels.some((candidate) => candidate.id === model)) {
            throw new Error(
                `Model "${model}" is not a tool-calling text model. Run: polli models`,
            );
        }
        const lease = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            {
                browser: options.browser,
                beforeCreate: async (accountKey) => {
                    const keyedModels = await fetchHarnessModels(accountKey);
                    if (
                        !keyedModels.some((candidate) => candidate.id === model)
                    ) {
                        throw new Error(
                            `Model "${model}" is not a tool-calling text model. Run: polli models`,
                        );
                    }
                },
            },
        );
        return withHarnessKeyLease(lease, async (apiKey) => {
            const models = await fetchHarnessModels(apiKey);
            if (!models.some((candidate) => candidate.id === model)) {
                throw new Error(
                    `Model "${model}" is not a tool-calling text model. Run: polli models`,
                );
            }
            return configureDsh(ctx, {
                apiKey,
                model,
                models,
                mcp: options.mcp,
            });
        });
    },

    off: disableDsh,
    status: result,
};
