import { readdirSync, rmdirSync } from "node:fs";
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
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
// Never fold long scalars (the API key) across lines.
const YAML_OUT = { lineWidth: 0 };

/**
 * Hermes home: HERMES_HOME wins, else the platform default Hermes itself uses
 * (`%LOCALAPPDATA%\hermes` on Windows, `~/.hermes` elsewhere).
 */
export const hermesHome = (ctx: HarnessContext) => {
    const configured = ctx.env.HERMES_HOME;
    if (configured?.trim()) return resolveHomePath(ctx.home, configured);
    if (process.platform === "win32") {
        const base =
            ctx.env.LOCALAPPDATA?.trim() ?? join(ctx.home, "AppData", "Local");
        return join(base, "hermes");
    }
    return join(ctx.home, ".hermes");
};

const configPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(hermesHome(ctx), ".env");
// Hermes scans $HERMES_HOME/skills/ recursively for SKILL.md files.
const skillDir = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli");
const skillPath = (ctx: HarnessContext) => join(skillDir(ctx), "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

// parseDocument keeps comments and untouched entries intact on rewrite.
const loadYaml = (path: string) => {
    const doc = parseDocument(readTextIfExists(path) ?? "");
    if (doc.contents === null) doc.contents = doc.createNode({}) as never;
    return doc;
};

const readKey = (ctx: HarnessContext) => {
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
    writeTextAtomic(envPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

const writeConfig = (ctx: HarnessContext, model: string) => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) {
        throw new Error(`${configPath(ctx)} must contain a YAML mapping`);
    }
    // A named custom provider: Hermes reads the key from key_env and
    // discovers the live model catalog from the OpenAI-compatible endpoint.
    doc.setIn(["providers", PROVIDER], {
        name: "Pollinations",
        api: `${BASE_URL}/v1`,
        key_env: KEY_ENV,
    });
    doc.setIn(["model", "provider"], PROVIDER);
    doc.setIn(["model", "default"], model);
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) return false;
    let changed = false;

    if (isMap(doc.getIn(["providers", PROVIDER]))) {
        doc.deleteIn(["providers", PROVIDER]);
        changed = true;
    }
    // Only unwind the default when this provider still owns it, so a model the
    // user moved to another provider survives.
    if (doc.getIn(["model", "provider"]) === PROVIDER) {
        doc.deleteIn(["model", "provider"]);
        doc.deleteIn(["model", "default"]);
        changed = true;
    }
    if (changed)
        writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
    return changed;
};

const writeSkill = (ctx: HarnessContext) => {
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripSkill = (ctx: HarnessContext) => {
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        return true;
    }
    return false;
};

/** Drop the `skills/polli` dir once it is empty, so `off` leaves no trace. */
const cleanupSkillDir = (ctx: HarnessContext) => {
    try {
        if (readdirSync(skillDir(ctx)).length === 0) rmdirSync(skillDir(ctx));
    } catch {
        // Directory absent or still holds user files; nothing to clean.
    }
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(configPath(ctx));
    const configured =
        isMap(doc.contents) &&
        isMap(doc.getIn(["providers", PROVIDER])) &&
        doc.getIn(["model", "provider"]) === PROVIDER &&
        readKey(ctx) !== null &&
        readTextIfExists(skillPath(ctx)) !== null;
    const model = doc.getIn(["model", "default"]);
    return {
        harness: ID,
        label: LABEL,
        installed: hermesInstalled(ctx),
        configured,
        model: configured && typeof model === "string" ? model : undefined,
        files: files(ctx),
    };
};

interface HermesSettings {
    apiKey: string;
    model: string;
}

const writeAll = (ctx: HarnessContext, settings: HermesSettings) => {
    writeConfig(ctx, settings.model);
    setEnvKey(ctx, settings.apiKey);
    writeSkill(ctx);
};

const stripAll = (ctx: HarnessContext) => {
    let changed = stripConfig(ctx);
    changed = deleteEnvKey(ctx) || changed;
    changed = stripSkill(ctx) || changed;
    return changed;
};

export const configureHermes = (
    ctx: HarnessContext,
    settings: HermesSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeAll(ctx, settings));
    return result(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripAll(ctx));
    cleanupSkillDir(ctx);
    return { ...result(ctx), configured: false, outcome };
};

const INSTALL_HINT =
    process.platform === "win32"
        ? "iex (irm https://hermes-agent.nousresearch.com/install.ps1)"
        : "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";

const hermesInstalled = (ctx: HarnessContext) =>
    commandExists("hermes", ctx.env, [
        join(hermesHome(ctx), "hermes-agent", "hermes"),
        join(hermesHome(ctx), "bin", "hermes"),
    ]);

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Hermes Agent to use Pollinations",
    restartHint:
        "Start a new Hermes session to pick up the provider and skill. Run hermes model to switch models.",

    async on(ctx, options) {
        if (!hermesInstalled(ctx)) {
            throw new Error(
                `Hermes Agent was not found. Install it first: ${INSTALL_HINT}`,
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
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
