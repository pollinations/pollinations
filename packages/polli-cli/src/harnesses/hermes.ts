import { parseEnv } from "node:util";
import { isMap, parseDocument } from "yaml";
import polliSkill from "../../SKILL.md?raw";
import { fetchMcpCatalog, type McpServer } from "../mcp/catalog.js";
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
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
const PROVIDER = "custom";
const API_URL = `${BASE_URL}/v1`;
const MCP_PREFIX = `${BASE_URL}/mcp/`;
const YAML_OUT = { lineWidth: 0 };

type ConfigContext = { home: string; env: NodeJS.ProcessEnv };

export const hermesHome = (ctx: ConfigContext) => {
    const configured = ctx.env.HERMES_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : joinHome(ctx.home);
};

const joinHome = (home: string) => resolveHomePath(home, "~/.hermes");
export const hermesConfigPath = (ctx: ConfigContext) =>
    `${hermesHome(ctx)}/config.yaml`;
export const hermesEnvPath = (ctx: ConfigContext) => `${hermesHome(ctx)}/.env`;
export const hermesSkillPath = (ctx: ConfigContext) =>
    `${hermesHome(ctx)}/skills/polli/SKILL.md`;

const files = (ctx: HarnessContext) => [
    hermesConfigPath(ctx),
    hermesEnvPath(ctx),
    hermesSkillPath(ctx),
];

const loadYaml = (path: string) => parseDocument(readTextIfExists(path) ?? "");

const readKey = (ctx: ConfigContext): string | null => {
    const text = readTextIfExists(hermesEnvPath(ctx));
    if (text === null) return null;
    return parseEnv(text)[KEY_ENV] || null;
};

const envLine = (key: string) => `${KEY_ENV}=${JSON.stringify(key)}`;
const keyLine = new RegExp(`^\\s*(?:export\\s+)?${KEY_ENV}\\s*=`, "u");

const setEnvKey = (ctx: ConfigContext, key: string) => {
    const lines = (readTextIfExists(hermesEnvPath(ctx)) ?? "").split("\n");
    const index = lines.findIndex((line) => keyLine.test(line));
    const filtered = lines.filter(
        (line, i) => i === index || !keyLine.test(line),
    );
    if (index === -1) {
        const insertAt =
            filtered.at(-1) === "" ? filtered.length - 1 : filtered.length;
        filtered.splice(insertAt, 0, envLine(key));
    } else filtered[index] = envLine(key);
    writeTextAtomic(hermesEnvPath(ctx), filtered.join("\n"), 0o600);
};

const deleteEnvKey = (ctx: ConfigContext, expected?: string) => {
    const text = readTextIfExists(hermesEnvPath(ctx));
    if (text === null) return false;
    const current = parseEnv(text)[KEY_ENV];
    if (expected !== undefined && current !== expected) return false;
    const lines = text.split("\n");
    const filtered = lines.filter((line) => !keyLine.test(line));
    if (filtered.length === lines.length) return false;
    writeTextAtomic(hermesEnvPath(ctx), filtered.join("\n"), 0o600);
    return true;
};

const setHermesModel = (
    doc: ReturnType<typeof loadYaml>,
    model: string,
    keyEnv: string,
) => {
    const current = doc.get("model", true);
    if (current !== undefined && !isMap(current)) {
        throw new Error("Hermes config model must be a YAML mapping");
    }
    doc.setIn(["model", "provider"], PROVIDER);
    doc.setIn(["model", "default"], model);
    doc.setIn(["model", "base_url"], API_URL);
    doc.setIn(["model", "api_mode"], "chat_completions");
    doc.setIn(["model", "key_env"], keyEnv);
};

const isPollinationsMcp = (entry: unknown) => {
    if (!isMap(entry)) return false;
    const url = entry.get("url");
    return typeof url === "string" && url.startsWith(MCP_PREFIX);
};

const pairKey = (pair: { key?: unknown }) => {
    const key = pair.key as { value?: unknown } | undefined;
    return String(key?.value ?? pair.key ?? "");
};

export const hermesMcpIds = (ctx: ConfigContext): string[] => {
    const doc = loadYaml(hermesConfigPath(ctx));
    const table = doc.get("mcp_servers", true);
    if (!isMap(table)) return [];
    return table.items
        .filter((pair) => isPollinationsMcp(table.get(pairKey(pair), true)))
        .map(pairKey);
};

const hermesMcpKey = (ctx: ConfigContext): string | null => {
    const doc = loadYaml(hermesConfigPath(ctx));
    const table = doc.get("mcp_servers", true);
    if (!isMap(table)) return null;
    for (const pair of table.items) {
        const entry = table.get(pairKey(pair), true);
        if (!isPollinationsMcp(entry) || !isMap(entry)) continue;
        const headers = entry.get("headers", true);
        const authorization = isMap(headers)
            ? headers.get("Authorization")
            : undefined;
        if (
            typeof authorization === "string" &&
            authorization.startsWith("Bearer ")
        ) {
            return authorization.slice("Bearer ".length);
        }
    }
    return null;
};

export const configureHermesMcp = (
    ctx: ConfigContext,
    servers: McpServer[],
    key: string,
) => {
    const doc = loadYaml(hermesConfigPath(ctx));
    const current = doc.get("mcp_servers", true);
    if (current !== undefined && !isMap(current)) {
        throw new Error(
            `${hermesConfigPath(ctx)} mcp_servers must be a YAML mapping`,
        );
    }
    if (current === undefined) doc.set("mcp_servers", doc.createNode({}));
    for (const server of servers) {
        doc.setIn(
            ["mcp_servers", server.id],
            doc.createNode({
                url: server.url,
                headers: { Authorization: `Bearer ${key}` },
            }),
        );
    }
    writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);
};

export const removeHermesMcp = (ctx: ConfigContext) => {
    const doc = loadYaml(hermesConfigPath(ctx));
    const table = doc.get("mcp_servers", true);
    if (!isMap(table)) return false;
    let changed = false;
    for (const pair of [...table.items]) {
        const id = pairKey(pair);
        if (isPollinationsMcp(table.get(id, true))) {
            table.delete(id);
            changed = true;
        }
    }
    if (changed)
        writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);
    return changed;
};

const stripConfig = (ctx: HarnessContext) => {
    const doc = loadYaml(hermesConfigPath(ctx));
    let changed = false;
    const model = doc.get("model", true);
    if (
        isMap(model) &&
        model.get("provider") === PROVIDER &&
        model.get("base_url") === API_URL
    ) {
        for (const key of [
            "provider",
            "default",
            "base_url",
            "api_mode",
            "key_env",
        ]) {
            if (model.has(key)) {
                model.delete(key);
                changed = true;
            }
        }
        if (model.items.length === 0) doc.delete("model");
    }
    if (changed)
        writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);
    changed = removeHermesMcp(ctx) || changed;
    changed = deleteEnvKey(ctx) || changed;
    if (readTextIfExists(hermesSkillPath(ctx)) === polliSkill) {
        removeIfExists(hermesSkillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const doc = loadYaml(hermesConfigPath(ctx));
    const model = doc.get("model", true);
    const configured =
        isMap(model) &&
        model.get("provider") === PROVIDER &&
        model.get("base_url") === API_URL &&
        model.get("key_env") === KEY_ENV &&
        typeof model.get("default") === "string" &&
        readKey(ctx) !== null &&
        readTextIfExists(hermesSkillPath(ctx)) !== null;
    return {
        harness: ID,
        label: LABEL,
        configured,
        model:
            isMap(model) && typeof model.get("default") === "string"
                ? String(model.get("default"))
                : undefined,
        mcp: hermesMcpIds(ctx).length > 0,
        files: files(ctx),
    };
};

export const configureHermes = async (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string; mcp?: boolean },
    servers: McpServer[],
) => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        const doc = loadYaml(hermesConfigPath(ctx));
        setHermesModel(doc, settings.model, KEY_ENV);
        if (settings.mcp !== false) {
            const current = doc.get("mcp_servers", true);
            if (current !== undefined && !isMap(current)) {
                throw new Error(
                    `${hermesConfigPath(ctx)} mcp_servers must be a YAML mapping`,
                );
            }
            if (current === undefined)
                doc.set("mcp_servers", doc.createNode({}));
            for (const server of servers) {
                doc.setIn(
                    ["mcp_servers", server.id],
                    doc.createNode({
                        url: server.url,
                        headers: { Authorization: `Bearer ${settings.apiKey}` },
                    }),
                );
            }
        }
        writeTextAtomic(hermesConfigPath(ctx), doc.toString(YAML_OUT), 0o600);
        setEnvKey(ctx, settings.apiKey);
        if (readTextIfExists(hermesSkillPath(ctx)) === null) {
            writeTextAtomic(hermesSkillPath(ctx), polliSkill, 0o600);
        }
    });
    return result(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Hermes Agent to use Pollinations",
    restartHint: "Start a new Hermes session with: hermes",

    async on(ctx, options) {
        if (!commandExists("hermes", ctx.env)) {
            throw new Error(
                "Hermes Agent was not found. Install it from https://hermes-agent.nousresearch.com/ (Windows: iex (irm https://hermes-agent.nousresearch.com/install.ps1); Linux/macOS/WSL: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash)",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        const servers = options.mcp === false ? [] : await fetchMcpCatalog();
        return configureHermes(
            ctx,
            { apiKey, model, mcp: options.mcp },
            servers,
        );
    },

    off: disableHermes,
    status: result,
};

export const hermesMcpClient = {
    id: ID,
    label: LABEL,
    description: "Hermes Agent (~/.hermes/config.yaml)",
    install: (ctx: ConfigContext, servers: McpServer[], key: string) => {
        configureHermesMcp(ctx, servers, key);
        return {
            client: ID,
            label: LABEL,
            installed: hermesMcpIds(ctx),
            files: [hermesConfigPath(ctx)],
            notes: [],
        };
    },
    remove: (ctx: ConfigContext, serverIds?: string[]) => {
        const before = hermesMcpIds(ctx);
        if (!serverIds?.length) removeHermesMcp(ctx);
        else {
            const doc = loadYaml(hermesConfigPath(ctx));
            const table = doc.get("mcp_servers", true);
            if (isMap(table)) {
                for (const id of serverIds) {
                    if (isPollinationsMcp(table.get(id, true)))
                        table.delete(id);
                }
                writeTextAtomic(
                    hermesConfigPath(ctx),
                    doc.toString(YAML_OUT),
                    0o600,
                );
            }
        }
        const installed = hermesMcpIds(ctx);
        return {
            client: ID,
            label: LABEL,
            installed,
            removed: before.filter((id) => !installed.includes(id)),
            files: [hermesConfigPath(ctx)],
            notes: [],
        };
    },
    status: (ctx: ConfigContext) => ({ installed: hermesMcpIds(ctx) }),
    existingKey: hermesMcpKey,
};
