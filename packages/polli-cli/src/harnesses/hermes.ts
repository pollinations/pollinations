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
const DEFAULT_MODEL = "qwen/qwen3.8-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
const MCP_ID = "pollinations";
const MCP_URL = `${BASE_URL}/mcp/pollinations`;
// Never fold long scalars (the API key) across lines.
const YAML_OUT = { lineWidth: 0 };

export const hermesHome = (ctx: HarnessContext) => {
    const configured = ctx.env.HERMES_HOME;
    if (!configured?.trim()) return join(ctx.home, ".hermes");
    return resolveHomePath(ctx.home, configured);
};

const configPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(hermesHome(ctx), ".env");
const skillPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

// Load config.yaml, creating an empty mapping when the file is absent/empty.
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

    const provider = doc.getIn(["providers", PROVIDER]);
    if (isMap(provider)) {
        doc.deleteIn(["providers", PROVIDER]);
        changed = true;
    }
    if (doc.getIn(["model", "provider"]) === PROVIDER) {
        doc.deleteIn(["model", "provider"]);
        changed = true;
    }
    if (doc.getIn(["model", "default"]) === readModel(ctx)) {
        doc.deleteIn(["model", "default"]);
        changed = true;
    }
    if (changed)
        writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
    return changed;
};

// The model we last selected, recovered from the provider block we wrote.
const readModel = (ctx: HarnessContext): string | undefined => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) return undefined;
    const value = doc.getIn(["model", "default"]);
    return typeof value === "string" ? value : undefined;
};

const writeMcpEntry = (ctx: HarnessContext) => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) {
        throw new Error(`${configPath(ctx)} must contain a YAML mapping`);
    }
    doc.setIn(["mcp_servers", MCP_ID], {
        url: MCP_URL,
        headers: { Authorization: `Bearer \${${KEY_ENV}}` },
    });
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
};

const stripMcpEntry = (ctx: HarnessContext) => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) return false;
    const existing = doc.getIn(["mcp_servers", MCP_ID]);
    if (!isMap(existing) || existing.get("url") !== MCP_URL) return false;
    doc.deleteIn(["mcp_servers", MCP_ID]);
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
    return true;
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

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(configPath(ctx));
    const configured =
        isMap(doc.contents) &&
        isMap(doc.getIn(["providers", PROVIDER])) &&
        doc.getIn(["model", "provider"]) === PROVIDER &&
        readKey(ctx) !== null;
    return {
        harness: ID,
        label: LABEL,
        configured,
        model: configured ? readModel(ctx) : undefined,
        files: files(ctx),
    };
};

interface HermesSettings {
    apiKey: string;
    model: string;
    mcp: boolean;
}

const writeAll = (ctx: HarnessContext, settings: HermesSettings) => {
    writeConfig(ctx, settings.model);
    setEnvKey(ctx, settings.apiKey);
    writeSkill(ctx);
    if (settings.mcp) writeMcpEntry(ctx);
    else stripMcpEntry(ctx);
};

const stripAll = (ctx: HarnessContext) => {
    let changed = stripConfig(ctx);
    changed = deleteEnvKey(ctx) || changed;
    changed = stripSkill(ctx) || changed;
    changed = stripMcpEntry(ctx) || changed;
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
    return { ...result(ctx), outcome };
};

const hermesInstalled = (ctx: HarnessContext) =>
    commandExists("hermes", ctx.env, [
        join(hermesHome(ctx), "hermes-agent", "hermes"),
    ]);

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Hermes Agent to use Pollinations",
    restartHint:
        "Start a new Hermes session to pick up the provider, skill, and MCP server.",

    async on(ctx, options) {
        if (!hermesInstalled(ctx)) {
            throw new Error(
                "Hermes Agent was not found. Install it first: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        return configureHermes(ctx, {
            apiKey,
            model,
            mcp: options.mcp ?? true,
        });
    },

    off: disableHermes,
    status: result,
};
