import { createHash } from "node:crypto";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
    OffOutcome,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code Router";
const PROVIDER_NAME = "Pollinations";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const CONFIG_KEY = "default";
const ROUTER_DIR = "claude-code-router";
const CLAUDE_HINT = "Install Claude Code first: npm install -g @anthropic-ai/claude-code";
const ROUTER_HINT =
    "Install Claude Code Router first: npm install -g @musistudio/claude-code-router";

/** Config dir the router resolves at runtime, honouring its own overrides. */
export const claudeCodeRouterDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        const base =
            ctx.env.CCR_INTERNAL_APP_DATA_DIR?.trim() ||
            ctx.env.APPDATA ||
            ctx.env.LOCALAPPDATA ||
            join(ctx.home, "AppData", "Roaming");
        return join(base, ROUTER_DIR);
    }
    const base = ctx.env.CCR_INTERNAL_HOME_DIR?.trim() || ctx.home;
    return join(base, `.${ROUTER_DIR}`);
};

const configPath = (ctx: HarnessContext) =>
    join(claudeCodeRouterDir(ctx), "config.sqlite");

const sha256 = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const snapshotDir = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses");
const snapshotKey = (ctx: HarnessContext) => sha256(configPath(ctx)).slice(0, 12);
const snapshotMetaPath = (ctx: HarnessContext) =>
    join(snapshotDir(ctx), `${ID}.${snapshotKey(ctx)}.json`);
const snapshotCopyPath = (ctx: HarnessContext) =>
    join(snapshotDir(ctx), `${ID}.${snapshotKey(ctx)}.sqlite`);

interface SqliteStatement {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
    close(): void;
}

interface SqliteModule {
    DatabaseSync: new (
        path: string,
        options?: { readOnly?: boolean },
    ) => SqliteDatabase;
}

const require = createRequire(import.meta.url);

// polli ships for Node 20, where node:sqlite does not exist yet. Only the
// harness path needs it, so the failure stays contained to this adapter.
const loadSqlite = (): SqliteModule => {
    try {
        return require("node:sqlite") as SqliteModule;
    } catch {
        throw new Error(
            "Claude Code Router stores its config in SQLite, which needs Node.js 22.5 or newer.",
        );
    }
};

const openDatabase = (path: string, readOnly: boolean) => {
    const { DatabaseSync } = loadSqlite();
    return new DatabaseSync(path, { readOnly });
};

interface RouterProvider {
    api_base_url?: string;
    api_key?: string;
    enabled?: boolean;
    models: string[];
    name: string;
    [key: string]: unknown;
}

interface RouterProfile {
    agent?: string;
    enabled?: boolean;
    id?: string;
    model?: string;
    name?: string;
    [key: string]: unknown;
}

interface RouterConfig {
    Providers?: RouterProvider[];
    profile?: {
        enabled?: boolean;
        profiles?: RouterProfile[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

const readConfigText = (ctx: HarnessContext): string | null => {
    const path = configPath(ctx);
    if (!existsSync(path)) return null;
    const db = openDatabase(path, true);
    try {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = ? LIMIT 1")
            .get(CONFIG_KEY) as { value_json?: string } | undefined;
        return row?.value_json ?? null;
    } finally {
        db.close();
    }
};

const readConfig = (ctx: HarnessContext): RouterConfig | null => {
    const text = readConfigText(ctx);
    if (text === null) return null;
    try {
        return JSON.parse(text) as RouterConfig;
    } catch {
        return null;
    }
};

const writeConfig = (ctx: HarnessContext, config: RouterConfig) => {
    const db = openDatabase(configPath(ctx), false);
    try {
        db.prepare(
            "INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?) " +
                "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        ).run(CONFIG_KEY, JSON.stringify(config), new Date().toISOString());
    } finally {
        db.close();
    }
};

interface RouterSnapshot {
    /** Consistent copy of the database taken before the first `on`. */
    copy: string;
    /** Whether config.sqlite existed then; false means off deletes it. */
    existed: boolean;
    /** Hash of the config our last `on` wrote, or null while applying. */
    configHash: string | null;
}

const loadSnapshot = (ctx: HarnessContext): RouterSnapshot | null => {
    const text = readTextIfExists(snapshotMetaPath(ctx));
    if (!text) return null;
    try {
        return JSON.parse(text) as RouterSnapshot;
    } catch {
        return null;
    }
};

const writeSnapshot = (ctx: HarnessContext, snapshot: RouterSnapshot) => {
    mkdirSync(snapshotDir(ctx), { recursive: true, mode: 0o700 });
    writeFileSync(
        snapshotMetaPath(ctx),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        { mode: 0o600 },
    );
};

const clearSnapshot = (ctx: HarnessContext) => {
    rmSync(snapshotMetaPath(ctx), { force: true });
    rmSync(snapshotCopyPath(ctx), { force: true });
};

/** VACUUM INTO writes a consistent single-file copy even while WAL is active. */
const backUpDatabase = (ctx: HarnessContext) => {
    const db = openDatabase(configPath(ctx), true);
    try {
        rmSync(snapshotCopyPath(ctx), { force: true });
        mkdirSync(dirname(snapshotCopyPath(ctx)), { recursive: true, mode: 0o700 });
        db.exec(`VACUUM INTO '${snapshotCopyPath(ctx).replace(/'/gu, "''")}'`);
        // The router keeps its own database private, and this copy carries the
        // same API keys, so it must not inherit a looser umask.
        chmodSync(snapshotCopyPath(ctx), 0o600);
    } finally {
        db.close();
    }
};

const restoreDatabase = (ctx: HarnessContext) => {
    const snapshot = loadSnapshot(ctx);
    if (!snapshot) return;
    if (snapshot.existed) {
        copyFileSync(snapshot.copy, configPath(ctx));
        chmodSync(configPath(ctx), 0o600);
        rmSync(`${configPath(ctx)}-wal`, { force: true });
        rmSync(`${configPath(ctx)}-shm`, { force: true });
    } else {
        rmSync(configPath(ctx), { force: true });
    }
};

const providerEntry = (ctx: HarnessContext) =>
    readConfig(ctx)?.Providers?.find(
        (provider) => provider.name === PROVIDER_NAME,
    ) ?? null;

const profileEntry = (ctx: HarnessContext) =>
    readConfig(ctx)?.profile?.profiles?.find(
        (profile) => profile.agent === "claude-code",
    ) ?? null;

const readKey = (ctx: HarnessContext) => {
    const key = providerEntry(ctx)?.api_key?.trim();
    return key ? key : null;
};

const readModel = (ctx: HarnessContext): string | undefined => {
    const model = profileEntry(ctx)?.model;
    return typeof model === "string" && model.startsWith(`${PROVIDER_NAME}/`)
        ? model.slice(PROVIDER_NAME.length + 1)
        : undefined;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const provider = providerEntry(ctx);
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.enabled === true &&
            Boolean(provider.api_key?.trim()) &&
            readModel(ctx) !== undefined,
        model: readModel(ctx),
        files: [configPath(ctx)],
    };
};

interface ClaudeCodeRouterSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const applyConfig = (ctx: HarnessContext, settings: ClaudeCodeRouterSettings) => {
    const config = readConfig(ctx);
    if (!config) {
        throw new Error(
            `Claude Code Router config at ${configPath(ctx)} could not be read. Start it once with: ccr start`,
        );
    }
    const profile = config.profile?.profiles?.find(
        (candidate) => candidate.agent === "claude-code",
    );
    if (!profile) {
        throw new Error(
            "Claude Code Router has no claude-code profile yet. Open its dashboard once: ccr ui",
        );
    }
    config.Providers = [
        ...(config.Providers ?? []).filter(
            (provider) => provider.name !== PROVIDER_NAME,
        ),
        {
            name: PROVIDER_NAME,
            api_base_url: `${BASE_URL}/v1`,
            api_key: settings.apiKey,
            type: "openai_chat_completions",
            models: settings.models.map((model) => model.id),
            enabled: true,
        },
    ];
    profile.model = `${PROVIDER_NAME}/${settings.model}`;
    writeConfig(ctx, config);
};

const stripConfig = (ctx: HarnessContext) => {
    const config = readConfig(ctx);
    if (!config) return false;
    let changed = false;
    const providers = (config.Providers ?? []).filter(
        (provider) => provider.name !== PROVIDER_NAME,
    );
    if (providers.length !== (config.Providers ?? []).length) {
        config.Providers = providers;
        changed = true;
    }
    for (const profile of config.profile?.profiles ?? []) {
        if (
            typeof profile.model === "string" &&
            profile.model.startsWith(`${PROVIDER_NAME}/`)
        ) {
            profile.model = "";
            changed = true;
        }
    }
    if (changed) writeConfig(ctx, config);
    return changed;
};

export const configureClaudeCodeRouter = (
    ctx: HarnessContext,
    settings: ClaudeCodeRouterSettings,
): HarnessResult => {
    const existing = loadSnapshot(ctx);
    if (!existing) {
        backUpDatabase(ctx);
        writeSnapshot(ctx, {
            copy: snapshotCopyPath(ctx),
            existed: true,
            configHash: null,
        });
    }
    try {
        applyConfig(ctx, settings);
    } catch (error) {
        restoreDatabase(ctx);
        clearSnapshot(ctx);
        throw error;
    }
    writeSnapshot(ctx, {
        copy: snapshotCopyPath(ctx),
        existed: true,
        configHash: sha256(readConfigText(ctx) ?? ""),
    });
    return result(ctx);
};

export const disableClaudeCodeRouter = (ctx: HarnessContext): HarnessResult => {
    const snapshot = loadSnapshot(ctx);
    let outcome: OffOutcome = "unchanged";
    if (snapshot) {
        const current = readConfigText(ctx);
        const untouched =
            snapshot.configHash !== null &&
            current !== null &&
            sha256(current) === snapshot.configHash;
        if (untouched) {
            restoreDatabase(ctx);
            outcome = "restored";
        } else {
            outcome = stripConfig(ctx) ? "stripped" : "unchanged";
        }
        clearSnapshot(ctx);
    } else if (stripConfig(ctx)) {
        outcome = "stripped";
    }
    return { ...result(ctx), configured: false, outcome };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Route Claude Code through Claude Code Router to Pollinations models",
    restartHint:
        "Restart Claude Code, or run ccr restart, to pick up the new provider.",

    async on(ctx, options) {
        if (!existsSync(configPath(ctx))) {
            throw new Error(
                `Claude Code Router config was not found at ${configPath(ctx)}. ${ROUTER_HINT}`,
            );
        }
        if (
            !commandExists("ccr", ctx.env, [join(ctx.home, ".local", "bin", "ccr")])
        ) {
            throw new Error(`Claude Code Router was not found. ${ROUTER_HINT}`);
        }
        if (
            !commandExists("claude", ctx.env, [
                join(ctx.home, ".local", "bin", "claude"),
            ])
        ) {
            throw new Error(`Claude Code was not found. ${CLAUDE_HINT}`);
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureClaudeCodeRouter(ctx, { apiKey, model, models });
    },

    off: disableClaudeCodeRouter,
    status: result,
};
