import { join } from "node:path";
import { parseDocument } from "yaml";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, writeTextAtomic } from "./fs.js";
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

const ID = "dsh";
const LABEL = "DeepSeek Harness";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek";
const KEY_ENV = "POLLINATIONS_API_KEY";
const PROVIDER_PATH = ["llm-pi-ai", "providers", PROVIDER];
const DEFAULT_MODEL_PATH = ["agent-default-model"];
const KEY_PATH = ["refs", KEY_ENV];
// Never fold long scalars (the API key) across lines.
const YAML_OUT = { lineWidth: 0 };

export const dshHome = (ctx: HarnessContext) =>
    ctx.env.DSH_HOME ?? join(ctx.home, ".dsh");
const settingsPath = (ctx: HarnessContext) =>
    join(dshHome(ctx), "settings.yaml");
const credentialsPath = (ctx: HarnessContext) =>
    join(dshHome(ctx), ".credentials.yaml");

// parseDocument keeps comments and untouched entries intact on rewrite.
const loadYaml = (path: string) => parseDocument(readTextIfExists(path) ?? "");

const files = (ctx: HarnessContext) => [
    settingsPath(ctx),
    credentialsPath(ctx),
];

const readKey = (ctx: HarnessContext) => {
    const key = loadYaml(credentialsPath(ctx)).getIn(KEY_PATH);
    return typeof key === "string" ? key : null;
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
}

const writeConfig = (ctx: HarnessContext, settings: DshSettings) => {
    const doc = loadYaml(settingsPath(ctx));
    doc.setIn(PROVIDER_PATH, doc.createNode(providerConfig(settings.models)));
    doc.setIn(
        DEFAULT_MODEL_PATH,
        doc.createNode({ provider: PROVIDER, model: settings.model }),
    );
    writeTextAtomic(settingsPath(ctx), doc.toString(YAML_OUT));

    // dsh reads secrets from its own owner-only document:
    // `version: 1` with a `refs:` map of env-style names.
    const creds = loadYaml(credentialsPath(ctx));
    creds.set("version", 1);
    creds.setIn(KEY_PATH, settings.apiKey);
    writeTextAtomic(credentialsPath(ctx), creds.toString(YAML_OUT), 0o600);
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
    if (changed) writeTextAtomic(settingsPath(ctx), doc.toString(YAML_OUT));

    const creds = loadYaml(credentialsPath(ctx));
    if (creds.hasIn(KEY_PATH)) {
        creds.deleteIn(KEY_PATH);
        writeTextAtomic(credentialsPath(ctx), creds.toString(YAML_OUT), 0o600);
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
            doc.hasIn(PROVIDER_PATH) &&
            doc.getIn([...DEFAULT_MODEL_PATH, "provider"]) === PROVIDER,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configureDsh = (
    ctx: HarnessContext,
    settings: DshSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
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
    restartHint:
        "Changes apply on the next request. Start DeepSeek Harness with: npx @deepseek-ai/dsh web",

    async on(ctx, options) {
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
        return configureDsh(ctx, { apiKey, model, models });
    },

    off: disableDsh,
    status: result,
};
