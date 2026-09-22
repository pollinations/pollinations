import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import type { HarnessContext } from "./types.js";

/** Claude Code Router's management RPC — the same API its own UI calls. */
export interface CcrConfig {
    Providers: CcrProvider[];
    profile: { profiles: CcrProfile[] };
    APIKEY: string;
    [key: string]: unknown;
}

export interface CcrProvider {
    id?: string;
    name: string;
    api_base_url: string;
    api_key: string;
    models: string[];
}

export interface CcrProfile {
    id: string;
    name: string;
    agent: string;
    model: string;
    enabled: boolean;
    scope?: string;
    [key: string]: unknown;
}

export const PROVIDER_NAME = "pollinations";
export const PROFILE_ID = "pollinations-claude-code";
export const CCR_INSTALL = "npm install -g @musistudio/claude-code-router";
export const CLAUDE_INSTALL = "npm install -g @anthropic-ai/claude-code";
/** First CCR release known to expose /api/ccr/rpc with getConfig/saveConfig. */
export const MIN_CCR_VERSION = "3.0.0";
export const gatewayBase = `${BASE_URL}/v1`;

export const ccrDir = (ctx: HarnessContext) =>
    process.platform === "win32"
        ? join(
              ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
              "claude-code-router",
          )
        : join(ctx.home, ".claude-code-router");

export const ccrConfigFile = (ctx: HarnessContext) =>
    join(ccrDir(ctx), "config.sqlite");

const serviceFile = (ctx: HarnessContext) => join(ccrDir(ctx), "service.json");

const alive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

export interface CcrService {
    origin: string;
    token: string;
}

const readService = (ctx: HarnessContext): CcrService | null => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) return null;
    try {
        const { pid, url } = JSON.parse(text) as { pid: number; url: string };
        if (!alive(pid)) return null;
        const parsed = new URL(url);
        return {
            origin: parsed.origin,
            token: parsed.searchParams.get("ccr_web_token") ?? "",
        };
    } catch {
        return null;
    }
};

/**
 * The running CCR service. Never started here: CCR's default global profiles
 * take over ~/.claude and ~/.codex the first time it runs with a provider, so
 * starting it is the user's explicit step.
 */
export const requireService = (ctx: HarnessContext): CcrService => {
    const service = readService(ctx);
    if (!service) {
        throw new Error(
            "Claude Code Router is not running. Start it first: ccr start",
        );
    }
    return service;
};

export const serviceRunning = (ctx: HarnessContext) =>
    readService(ctx) !== null;

export const ccrInstalled = (ctx: HarnessContext) =>
    commandExists("ccr", ctx.env);

export const claudeInstalled = (ctx: HarnessContext) =>
    commandExists("claude", ctx.env);

export const rpc = async <T>(
    service: CcrService,
    method: string,
    ...args: unknown[]
): Promise<T> => {
    const res = await fetch(`${service.origin}/api/ccr/rpc`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-ccr-web-auth": service.token,
        },
        body: JSON.stringify({ method, args }),
    });
    if (!res.ok) {
        throw new Error(`CCR ${method}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
        ok: boolean;
        value: T;
        error?: { message: string };
    };
    if (!body.ok) throw new Error(`CCR ${method}: ${body.error?.message}`);
    return body.value;
};

export const providerFor = (config: CcrConfig) =>
    config.Providers?.find((p) => p.name === PROVIDER_NAME);

export const profileFor = (config: CcrConfig) =>
    config.profile?.profiles?.find((p) => p.id === PROFILE_ID);

/** CCR gateway addresses a model as `<protocol>/<model id>`. */
export const routeModel = (model: string) => `openai/${model}`;

/** Installed CCR version, or null when it cannot be determined. */
export const ccrVersion = (ctx: HarnessContext): string | null => {
    const run = spawnSync("ccr", ["--version"], {
        env: ctx.env,
        encoding: "utf-8",
        shell: process.platform === "win32",
        timeout: 10_000,
    });
    if (run.status !== 0) return null;
    const match = `${run.stdout ?? ""}${run.stderr ?? ""}`.match(
        /\d+\.\d+\.\d+/,
    );
    return match?.[0] ?? null;
};

const atLeast = (version: string, minimum: string) => {
    const a = version.split(".").map(Number);
    const b = minimum.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return true;
};

/** True when the installed CCR is new enough for the management RPC. */
export const ccrVersionSupported = (version: string | null) =>
    version === null || atLeast(version, MIN_CCR_VERSION);

// ---------------------------------------------------------------------------
// SQLite fallback: status and off must work when the router is not running.
// Writes only happen while the service is down (no concurrent writer); when
// it is up, every mutation goes through the management RPC instead.
// ---------------------------------------------------------------------------

type SqliteModule = typeof import("node:sqlite");

const loadSqlite = async (): Promise<SqliteModule> => {
    try {
        return await import("node:sqlite");
    } catch (error) {
        throw new Error(
            "Reading Claude Code Router state without the service needs node:sqlite, which is unavailable on this Node. " +
                "Start the router (ccr start) and retry, or upgrade Node.",
            { cause: error },
        );
    }
};

const APP_CONFIG_KEY = "default";

export const readConfigSqlite = async (
    ctx: HarnessContext,
): Promise<CcrConfig | null> => {
    const file = ccrConfigFile(ctx);
    if (!existsSync(file)) return null;
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = ? LIMIT 1")
            .get(APP_CONFIG_KEY) as { value_json: string } | undefined;
        return row ? (JSON.parse(row.value_json) as CcrConfig) : null;
    } finally {
        db.close();
    }
};

export const writeConfigSqlite = async (
    ctx: HarnessContext,
    config: CcrConfig,
): Promise<void> => {
    if (serviceRunning(ctx)) {
        throw new Error(
            "Refusing to write Claude Code Router's config.sqlite while the service is running",
        );
    }
    const file = ccrConfigFile(ctx);
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(file);
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `);
        db.prepare(
            `INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        ).run(APP_CONFIG_KEY, JSON.stringify(config), new Date().toISOString());
    } finally {
        db.close();
    }
};

/** Read config through the RPC when the service is up, SQLite when it is down. */
export const readConfig = async (
    ctx: HarnessContext,
): Promise<CcrConfig | null> => {
    const service = readService(ctx);
    if (service) return rpc<CcrConfig>(service, "getConfig");
    return readConfigSqlite(ctx);
};

/** Write config through the RPC when the service is up, SQLite when it is down. */
export const writeConfig = async (
    ctx: HarnessContext,
    config: CcrConfig,
): Promise<void> => {
    const service = readService(ctx);
    if (service) {
        await rpc(service, "saveConfig", config);
        return;
    }
    await writeConfigSqlite(ctx, config);
};
