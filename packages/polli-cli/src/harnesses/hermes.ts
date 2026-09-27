import { join } from "node:path";
import { parseEnv } from "node:util";
import { parseDocument } from "yaml";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
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
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
const PROVIDER_PATH = ["providers", PROVIDER];
const MODEL_PATH = ["model"];
// Never fold long scalars (the API key) across lines.
const YAML_OUT = { lineWidth: 0 };

export const hermesHome = (ctx: HarnessContext): string => {
    const configured = ctx.env.HERMES_HOME;
    if (!configured?.trim()) return join(ctx.home, ".hermes");
    return resolveHomePath(ctx.home, configured);
};

export const hermesConfigFile = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(hermesHome(ctx), ".env");
// Hermes auto-discovers SKILL.md files under $HERMES_HOME/skills/<name>/.
const skillPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    hermesConfigFile(ctx),
    envPath(ctx),
    skillPath(ctx),
];

// parseDocument keeps config.yaml's comments and untouched entries intact.
const loadYaml = (path: string) => parseDocument(readTextIfExists(path) ?? "");

const readKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    return parseEnv(text)[KEY_ENV] || null;
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

interface HermesSettings {
    apiKey: string;
    model: string;
}

const writeConfig = (ctx: HarnessContext, settings: HermesSettings) => {
    const doc = loadYaml(hermesConfigFile(ctx));
    doc.setIn(
        PROVIDER_PATH,
        doc.createNode({
            base_url: `${BASE_URL}/v1`,
            key_env: KEY_ENV,
            api_mode: "chat_completions",
        }),
    );
    doc.setIn([...MODEL_PATH, "provider"], PROVIDER);
    doc.setIn([...MODEL_PATH, "default"], settings.model);
    writeTextAtomic(hermesConfigFile(ctx), doc.toString(YAML_OUT), 0o600);
    setEnvKey(ctx, settings.apiKey);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    let changed = false;
    const doc = loadYaml(hermesConfigFile(ctx));

    if (doc.hasIn(PROVIDER_PATH)) {
        doc.deleteIn(PROVIDER_PATH);
        changed = true;
    }
    // Only drop a default we set; a user-chosen provider stays untouched.
    if (doc.getIn([...MODEL_PATH, "provider"]) === PROVIDER) {
        doc.deleteIn([...MODEL_PATH, "provider"]);
        doc.deleteIn([...MODEL_PATH, "default"]);
        changed = true;
    }
    if (changed) {
        writeTextAtomic(hermesConfigFile(ctx), doc.toString(YAML_OUT), 0o600);
    }

    changed = deleteEnvKey(ctx) || changed;
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(hermesConfigFile(ctx));
    const model = doc.getIn([...MODEL_PATH, "default"]);
    return {
        harness: ID,
        label: LABEL,
        configured:
            doc.getIn([...PROVIDER_PATH, "base_url"]) === `${BASE_URL}/v1` &&
            doc.getIn([...PROVIDER_PATH, "key_env"]) === KEY_ENV &&
            doc.getIn([...MODEL_PATH, "provider"]) === PROVIDER &&
            typeof model === "string" &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configureHermes = (
    ctx: HarnessContext,
    settings: HermesSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a provider in Hermes Agent",
    restartHint:
        "Changes apply on the next Hermes session. Start Hermes with: hermes",

    async on(ctx, options) {
        if (!commandExists("hermes", ctx.env)) {
            throw new Error(
                "Hermes Agent was not found. Install it first: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        // Hermes fetches its own live catalog from base_url/models; this call
        // only validates that the chosen model is a tool-calling text model.
        await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureHermes(ctx, { apiKey, model });
    },

    off: disableHermes,
    status: result,
};
