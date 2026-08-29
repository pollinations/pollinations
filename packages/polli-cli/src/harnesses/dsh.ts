import { join } from "node:path";
import { parseDocument } from "yaml";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, writeTextAtomic } from "./fs.js";
import type {
    HarnessContext,
    HarnessModel,
    HarnessProfile,
    HarnessSettings,
} from "./types.js";

const PROVIDER = "pollinations";
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

export const dsh: HarnessProfile = {
    id: "dsh",
    label: "DeepSeek Harness",
    docsUrl: "https://github.com/deepseek-ai/deepseek-harness",
    defaultModel: "deepseek",
    restartHint:
        "Restart dsh (`npx @deepseek-ai/dsh web`) to load the new provider.",

    files: (ctx) => [settingsPath(ctx), credentialsPath(ctx)],

    readKey: (ctx) => {
        const key = loadYaml(credentialsPath(ctx)).getIn(KEY_PATH);
        return typeof key === "string" ? key : null;
    },

    enable: (ctx, settings: HarnessSettings) => {
        const doc = loadYaml(settingsPath(ctx));
        doc.setIn(
            PROVIDER_PATH,
            doc.createNode(providerConfig(settings.models)),
        );
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
    },

    disable: (ctx) => {
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
            writeTextAtomic(
                credentialsPath(ctx),
                creds.toString(YAML_OUT),
                0o600,
            );
        }
    },

    status: (ctx) => {
        const doc = loadYaml(settingsPath(ctx));
        const model = doc.getIn([...DEFAULT_MODEL_PATH, "model"]);
        return {
            configured:
                doc.hasIn(PROVIDER_PATH) &&
                doc.getIn([...DEFAULT_MODEL_PATH, "provider"]) === PROVIDER,
            model: typeof model === "string" ? model : undefined,
        };
    },
};
