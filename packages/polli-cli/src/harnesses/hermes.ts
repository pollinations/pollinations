import { join } from "node:path";
import { parseDocument } from "yaml";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const BASE = `${BASE_URL}/v1`;
const MCP_PATH = ["mcp_servers", "pollinations"];
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
const files = (ctx: HarnessContext) => [configPath(ctx)];

// parseDocument keeps comments and untouched entries intact on rewrite.
const loadYaml = (ctx: HarnessContext) =>
    parseDocument(readTextIfExists(configPath(ctx)) ?? "");

const save = (ctx: HarnessContext, doc: ReturnType<typeof loadYaml>) =>
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);

const isOurs = (doc: ReturnType<typeof loadYaml>) =>
    doc.getIn(["model", "provider"]) === "custom" &&
    doc.getIn(["model", "base_url"]) === BASE;

const readKey = (ctx: HarnessContext) => {
    const doc = loadYaml(ctx);
    const key = doc.getIn(["model", "api_key"]);
    return isOurs(doc) && typeof key === "string" && key ? key : null;
};

interface HermesSettings {
    apiKey: string;
    model: string;
    mcp?: boolean;
}

const writeConfig = (ctx: HarnessContext, settings: HermesSettings) => {
    const doc = loadYaml(ctx);
    // Hermes reads any OpenAI-compatible endpoint as provider "custom".
    doc.setIn(["model", "provider"], "custom");
    doc.setIn(["model", "base_url"], BASE);
    doc.setIn(["model", "api_key"], settings.apiKey);
    doc.setIn(["model", "default"], settings.model);
    if (settings.mcp === false) {
        if (doc.hasIn(MCP_PATH)) doc.deleteIn(MCP_PATH);
    }
    else
        doc.setIn(
            MCP_PATH,
            doc.createNode({
                url: MCP_URL,
                headers: { Authorization: `Bearer ${settings.apiKey}` },
            }),
        );
    save(ctx, doc);
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadYaml(ctx);
    let changed = false;
    if (isOurs(doc)) {
        for (const key of ["provider", "base_url", "api_key", "default"])
            doc.deleteIn(["model", key]);
        changed = true;
    }
    if (doc.getIn([...MCP_PATH, "url"]) === MCP_URL) {
        doc.deleteIn(MCP_PATH);
        changed = true;
    }
    if (changed) save(ctx, doc);
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(ctx);
    const model = doc.getIn(["model", "default"]);
    return {
        harness: ID,
        label: LABEL,
        configured:
            readKey(ctx) !== null && typeof model === "string" && model !== "",
        model: typeof model === "string" ? model : undefined,
        mcp: doc.getIn([...MCP_PATH, "url"]) === MCP_URL,
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
    description: "Configure Hermes Agent to use Pollinations text models",
    restartHint: "Changes apply on the next hermes session.",

    async on(ctx, options) {
        if (!commandExists("hermes", ctx.env)) {
            throw new Error(
                "hermes was not found. Install it first: https://github.com/NousResearch/hermes-agent#quick-install",
            );
        }
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureHermes(ctx, {
            apiKey,
            model: options.model ?? DEFAULT_MODEL,
            mcp: options.mcp,
        });
    },

    off: disableHermes,
    status: result,
};
