import { join } from "node:path";
import { parseEnv } from "node:util";
import { isMap, parseDocument } from "yaml";
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
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
// Never fold long scalars (the API key reference, model ids) across lines.
const YAML_OUT = { lineWidth: 0 };

/**
 * HERMES_HOME wins; otherwise Hermes defaults to %LOCALAPPDATA%\hermes on
 * Windows and ~/.hermes everywhere else (confirmed against a real
 * `hermes config` run on both — Hermes does not use ~/.hermes on Windows).
 */
export const HERMES_INSTALL_HINT =
    process.platform === "win32"
        ? "Install it from PowerShell: iex (irm https://hermes-agent.nousresearch.com/install.ps1)"
        : "Install it: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";

export const hermesHome = (ctx: HarnessContext): string => {
    const configured = ctx.env.HERMES_HOME?.trim();
    if (configured) return resolveHomePath(ctx.home, configured);
    if (process.platform === "win32") {
        const localAppData = ctx.env.LOCALAPPDATA?.trim();
        const base = localAppData
            ? resolveHomePath(ctx.home, localAppData)
            : join(ctx.home, "AppData", "Local");
        return join(base, "hermes");
    }
    return join(ctx.home, ".hermes");
};

export const hermesConfigPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(hermesHome(ctx), ".env");
// Hermes auto-discovers SKILL.md files under <home>/skills/<name>/.
const skillPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    hermesConfigPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

// parseDocument keeps comments and untouched entries intact on rewrite.
export const loadHermesYaml = (path: string) =>
    parseDocument(readTextIfExists(path) ?? "");

const readKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    const key = parseEnv(text)[KEY_ENV];
    return key || null;
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
    // Drop a file that only held our key rather than leave an empty .env.
    if (filtered.every((line) => line.trim() === "")) {
        removeIfExists(envPath(ctx));
    } else writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

// Per-model metadata Hermes reads for context window and native vision
// support (providers.<name>.models.<id>.*) — no second hardcoded catalog,
// just the shape Hermes expects around the same live /v1/models data.
const modelsBlock = (models: HarnessModel[]) =>
    Object.fromEntries(
        models.map((model) => [
            model.id,
            {
                context_length: model.contextWindow,
                ...(model.input.includes("image")
                    ? { supports_vision: true }
                    : {}),
            },
        ]),
    );

// Current config.yaml schema (confirmed against a real Hermes Agent 0.21.5
// install: `hermes doctor` reports no "Unknown provider" warning, and a real
// `hermes chat --provider custom:pollinations` round-trips through this
// exact shape). Named custom providers live under providers:, keyed by name,
// and are selected as `custom:<name>` — plain `provider: pollinations` is
// not recognized. The older top-level `custom_providers:` list still works
// but is superseded by this dict form (Hermes auto-migrates it).
const writeConfig = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
) => {
    const doc = loadHermesYaml(hermesConfigPath(ctx));
    doc.setIn(
        ["providers", PROVIDER],
        doc.createNode({
            api: `${BASE_URL}/v1`,
            key_env: KEY_ENV,
            models: modelsBlock(models),
        }),
    );
    doc.setIn(
        ["model"],
        doc.createNode({ default: model, provider: `custom:${PROVIDER}` }),
    );
    writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);

    setEnvKey(ctx, apiKey);
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const doc = loadHermesYaml(hermesConfigPath(ctx));
    let changed = false;

    if (doc.hasIn(["providers", PROVIDER])) {
        doc.deleteIn(["providers", PROVIDER]);
        changed = true;
        const providers = doc.get("providers");
        if (isMap(providers) && providers.items.length === 0) {
            doc.delete("providers");
        }
    }
    if (doc.getIn(["model", "provider"]) === `custom:${PROVIDER}`) {
        doc.delete("model");
        changed = true;
    }
    if (changed)
        writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);

    changed = deleteEnvKey(ctx) || changed;
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadHermesYaml(hermesConfigPath(ctx));
    const model = doc.getIn(["model", "default"]);
    return {
        harness: ID,
        label: LABEL,
        configured:
            doc.getIn(["providers", PROVIDER, "api"]) === `${BASE_URL}/v1` &&
            doc.getIn(["providers", PROVIDER, "key_env"]) === KEY_ENV &&
            doc.getIn(["model", "provider"]) === `custom:${PROVIDER}` &&
            typeof model === "string" &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model: typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

export const configureHermes = (
    ctx: HarnessContext,
    models: HarnessModel[],
    apiKey: string,
    model: string,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () =>
        writeConfig(ctx, models, apiKey, model),
    );
    return result(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Add Pollinations as a custom provider in Hermes Agent",
    restartHint:
        "Changes apply on the next session. Start Hermes with: hermes chat",

    async on(ctx, options) {
        if (!commandExists("hermes", ctx.env)) {
            throw new Error(
                `Hermes Agent was not found. ${HERMES_INSTALL_HINT}`,
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureHermes(ctx, models, apiKey, model);
    },

    off: disableHermes,
    status: result,
};
