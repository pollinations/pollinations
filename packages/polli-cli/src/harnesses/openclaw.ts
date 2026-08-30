import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { isMap, isSeq, parseDocument } from "yaml";
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
const PROVIDER_ID = "pollinations";
const DEFAULT_MODEL = "openai";
const KEY_ENV = "POLLI_OPENCLAW_API_KEY";

const YAML_OUT = { lineWidth: 0 };
const JS_TAG = {
    tag: "tag:yaml.org,2002:js",
    resolve: (value: string) => value,
};

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
    join(openclawHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(openclawHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(openclawHome(ctx), "skills", "polli", "SKILL.md");

const loadYaml = (path: string) =>
    parseDocument(readTextIfExists(path) ?? "", { customTags: [JS_TAG] });

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

const readKey = (ctx: HarnessContext) => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    return parseEnv(text)[KEY_ENV] || null;
};

const envLine = (key: string) => `${KEY_ENV}=${JSON.stringify(key)}`;
const keyLine = new RegExp(
    `^\\s*(?:export\\s+)?${KEY_ENV}\\s*=`,
    "u",
);

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

const providerConfig = (models: HarnessModel[]) => ({
    api_key: `\${env:${KEY_ENV}}`,
    base_url: `${BASE_URL}/v1`,
    models: Object.fromEntries(
        models.map((m) => [
            m.id,
            {
                name: m.id,
                context_window: m.contextWindow,
                input_modalities: m.input,
            },
        ]),
    ),
});

interface OpenClawSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: OpenClawSettings) => {
    const doc = loadYaml(configPath(ctx));
    if (doc.contents === null || !isMap(doc.contents)) {
        doc.contents = doc.createNode({});
    }
    // Set provider
    doc.setIn(
        ["providers", PROVIDER_ID],
        doc.createNode(providerConfig(settings.models)),
    );
    // Set default provider and model
    doc.setIn(["provider"], PROVIDER_ID);
    doc.setIn(["model"], settings.model);
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
    setEnvKey(ctx, settings.apiKey);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadYaml(configPath(ctx));
    let changed = false;
    if (doc.hasIn(["providers", PROVIDER_ID])) {
        doc.deleteIn(["providers", PROVIDER_ID]);
        changed = true;
    }
    if (doc.getIn(["provider"]) === PROVIDER_ID) {
        doc.deleteIn(["provider"]);
        changed = true;
    }
    if (doc.getIn(["model"]) !== undefined && !changed) {
        // Only delete model if we own the provider
    }
    if (changed)
        writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
    changed = deleteEnvKey(ctx) || changed;
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(configPath(ctx));
    const provider = doc.getIn(["providers", PROVIDER_ID]);
    const defaultProvider = doc.getIn(["provider"]);
    const model = doc.getIn(["model"]);
    const isConfigured =
        isMap(provider) &&
        doc.getIn(["providers", PROVIDER_ID, "base_url"]) ===
            `${BASE_URL}/v1` &&
        defaultProvider === PROVIDER_ID &&
        typeof model === "string" &&
        readKey(ctx) !== null;

    return {
        harness: ID,
        label: LABEL,
        configured: isConfigured,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configureOpenClaw = (
    ctx: HarnessContext,
    settings: OpenClawSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, settings),
    );
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
        "Changes apply on the next request. Restart OpenClaw to pick up the new provider.",

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
        return configureOpenClaw(ctx, { apiKey, model, models });
    },

    off: disableOpenClaw,
    status: result,
};
