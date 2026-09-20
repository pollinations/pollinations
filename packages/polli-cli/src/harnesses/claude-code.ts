import { createHash } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { printInfo } from "../lib/output.js";
import { commandExists, readTextIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { smokeChat } from "./smoke.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code (Claude Code Router)";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const PROVIDER_NAME = "pollinations";
const BASE_URL = "https://gen.pollinations.ai/v1";

// Claude Code Router keeps its whole config in one SQLite row
// (config-repository.ts: table app_config, key "default", column value_json).
// The classic config.json is only a migration source, never a live surface,
// so this adapter talks to the row directly and snapshots its exact bytes.

// ---------------------------------------------------------------------------
// Paths (mirror app-paths.ts, including its CCR_INTERNAL_* overrides)
// ---------------------------------------------------------------------------

export const ccrConfigDir = (ctx: HarnessContext): string => {
    const override = ctx.env.CCR_INTERNAL_APP_DATA_DIR?.trim();
    if (override) return override;
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "claude-code-router",
        );
    }
    return join(ctx.home, ".claude-code-router");
};

export const configDbPath = (ctx: HarnessContext): string =>
    join(ccrConfigDir(ctx), "config.sqlite");

// ---------------------------------------------------------------------------
// SQLite access — node:sqlite needs Node 22.5+ (stable from Node 24)
// ---------------------------------------------------------------------------

interface SqliteDatabase {
    prepare: (sql: string) => {
        get: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => unknown;
    };
    exec: (sql: string) => void;
    close: () => void;
}

type DatabaseSyncConstructor = new (
    path: string,
    options?: { readOnly?: boolean },
) => SqliteDatabase;

export const loadSqlite = async (): Promise<DatabaseSyncConstructor> => {
    try {
        // Split the specifier so bundlers cannot rewrite `node:sqlite` into a
        // bare "sqlite" import (which Node does not register as a builtin).
        const specifier = "node:" + "sqlite";
        const module = await import(/* @vite-ignore */ specifier);
        return module.DatabaseSync as unknown as DatabaseSyncConstructor;
    } catch {
        throw new Error(
            "node:sqlite is unavailable in this Node.js build. Claude Code Router stores its config in SQLite, so polli needs Node 22.5+ (Node 24 LTS recommended).",
        );
    }
};

interface ConfigRow {
    valueJson: string;
    updatedAt: string;
}

const readConfigRow = (
    Database: DatabaseSyncConstructor,
    dbFile: string,
): ConfigRow | null => {
    if (!existsSync(dbFile)) return null;
    const db = new Database(dbFile, { readOnly: true });
    try {
        const row = db
            .prepare(
                "SELECT value_json, updated_at FROM app_config WHERE key = 'default' LIMIT 1",
            )
            .get() as { value_json?: string; updated_at?: string } | undefined;
        if (!row?.value_json) return null;
        return {
            valueJson: row.value_json,
            updatedAt: row.updated_at ?? "",
        };
    } finally {
        db.close();
    }
};

const writeConfigRow = (
    Database: DatabaseSyncConstructor,
    dbFile: string,
    valueJson: string,
) => {
    const db = new Database(dbFile);
    try {
        db.prepare(
            "INSERT INTO app_config (key, value_json, updated_at) VALUES ('default', ?, ?) " +
                "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, " +
                "updated_at = excluded.updated_at",
        ).run(valueJson, new Date().toISOString());
    } finally {
        db.close();
    }
};

// ---------------------------------------------------------------------------
// Pure cores (unit-tested)
// ---------------------------------------------------------------------------

interface ClaudeCodeRouterConfig {
    Providers?: Array<Record<string, unknown>>;
    profile?: {
        claudeCode?: Record<string, unknown>;
        [key: string]: unknown;
    };
    Router?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface PollinationsProvider {
    name: string;
    api_base_url: string;
    api_key: string;
    models: string[];
    enabled: boolean;
}

const isPollinations = (entry: Record<string, unknown>): boolean =>
    entry.name === PROVIDER_NAME ||
    entry.id === PROVIDER_NAME ||
    entry.provider === PROVIDER_NAME;

export const upsertProvider = (
    config: ClaudeCodeRouterConfig,
    provider: PollinationsProvider,
): { config: ClaudeCodeRouterConfig; changed: boolean } => {
    const providers = [...(config.Providers ?? [])];
    const index = providers.findIndex(isPollinations);
    if (index === -1) {
        return {
            config: { ...config, Providers: [...providers, { ...provider }] },
            changed: true,
        };
    }
    const merged = { ...providers[index], ...provider };
    if (JSON.stringify(providers[index]) === JSON.stringify(merged)) {
        return { config, changed: false };
    }
    providers[index] = merged;
    return { config: { ...config, Providers: providers }, changed: true };
};

/** Model selector fields the Claude Code agent profile routes through. */
const PROFILE_MODEL_FIELDS = [
    "model",
    "haikuModel",
    "sonnetModel",
    "opusModel",
    "smallFastModel",
    "fableModel",
] as const;

export const setProfileModel = (
    config: ClaudeCodeRouterConfig,
    model: string,
): { config: ClaudeCodeRouterConfig; changed: boolean } => {
    const before = JSON.stringify(config);
    const profile = { ...(config.profile ?? {}) };
    const claudeCode = { ...(profile.claudeCode ?? {}) };
    claudeCode.enabled = true;
    claudeCode.model = `${PROVIDER_NAME},${model}`;
    for (const field of PROFILE_MODEL_FIELDS) {
        if (field === "model") continue;
        const current = claudeCode[field];
        if (
            typeof current === "string" &&
            current.startsWith(`${PROVIDER_NAME},`)
        ) {
            // Our earlier selection follows the new model; user-set slots
            // pointing elsewhere are left alone.
            claudeCode[field] = `${PROVIDER_NAME},${model}`;
        }
    }
    profile.claudeCode = claudeCode;
    const next = { ...config, profile };
    return {
        config: next,
        changed: JSON.stringify(next) !== before,
    };
};

export const stripProvider = (
    config: ClaudeCodeRouterConfig,
): { config: ClaudeCodeRouterConfig; changed: boolean } => {
    let changed = false;
    const next: ClaudeCodeRouterConfig = { ...config };

    const providers = next.Providers;
    if (Array.isArray(providers) && providers.some(isPollinations)) {
        next.Providers = providers.filter((entry) => !isPollinations(entry));
        changed = true;
    }

    const claudeCode = next.profile?.claudeCode;
    if (claudeCode && typeof claudeCode === "object") {
        const cleaned = { ...claudeCode };
        let profileChanged = false;
        for (const field of PROFILE_MODEL_FIELDS) {
            const value = cleaned[field];
            if (
                typeof value === "string" &&
                value.startsWith(`${PROVIDER_NAME},`)
            ) {
                delete cleaned[field];
                profileChanged = true;
            }
        }
        if (profileChanged) {
            if (cleaned.enabled === true) delete cleaned.enabled;
            const profile = { ...next.profile };
            if (Object.keys(cleaned).length === 0) {
                delete profile.claudeCode;
            } else {
                profile.claudeCode = cleaned;
            }
            next.profile = profile;
            changed = true;
        }
    }

    return { config: next, changed };
};

// ---------------------------------------------------------------------------
// Row snapshot — exact pre-`on` bytes for byte-for-byte restore on `off`
// ---------------------------------------------------------------------------

interface RowSnapshot {
    before: string | null;
    afterHash: string | null;
}

const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const rowSnapshotPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", `${ID}.row.json`);

const readRowSnapshot = (ctx: HarnessContext): RowSnapshot | null => {
    const text = readTextIfExists(rowSnapshotPath(ctx));
    return text ? (JSON.parse(text) as RowSnapshot) : null;
};

const writeRowSnapshot = (ctx: HarnessContext, snapshot: RowSnapshot) =>
    writeTextAtomic(
        rowSnapshotPath(ctx),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );

const removeRowSnapshot = (ctx: HarnessContext) => {
    try {
        unlinkSync(rowSnapshotPath(ctx));
    } catch {
        // already gone
    }
};

// ---------------------------------------------------------------------------
// Status (read-only; never creates the database)
// ---------------------------------------------------------------------------

const statusResult = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const dbFile = configDbPath(ctx);
    const claudeInstalled = commandExists("claude", ctx.env, [
        join(ctx.home, ".claude", "local", "claude"),
    ]);
    let configured = false;
    let model: string | undefined;
    let providerPresent = false;
    let profileModel: string | undefined;
    if (existsSync(dbFile)) {
        try {
            const Database = await loadSqlite();
            const config = await readConfig(ctx, Database);
            const provider = config?.Providers?.find(isPollinations) as
                | PollinationsProvider
                | undefined;
            providerPresent = provider !== undefined;
            profileModel = config?.profile?.claudeCode?.model as
                | string
                | undefined;
            configured = providerPresent && Boolean(profileModel);
            if (profileModel?.startsWith(`${PROVIDER_NAME},`)) {
                model = profileModel.slice(PROVIDER_NAME.length + 1);
            }
        } catch {
            // A foreign or unreadable DB shape is reported as not configured.
        }
    }
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        files: [dbFile],
        claudeInstalled,
        router: existsSync(dbFile) ? dbFile : null,
        provider: providerPresent,
        profileModel,
    } as HarnessResult & Record<string, unknown>;
};

const readConfig = async (
    ctx: HarnessContext,
    Database: DatabaseSyncConstructor,
): Promise<ClaudeCodeRouterConfig | null> => {
    const row = readConfigRow(Database, configDbPath(ctx));
    if (row === null) return null;
    try {
        return JSON.parse(row.valueJson) as ClaudeCodeRouterConfig;
    } catch {
        throw new Error(
            `Claude Code Router config row is not valid JSON at ${configDbPath(ctx)} — refusing to touch it.`,
        );
    }
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const INSTALL_HINT =
    "Install Claude Code Router first: npm install -g @musistudio/claude-code-router (adds the `ccr` CLI), then start `ccr` once so it creates its config database, and re-run polli harness claude-code on.";

export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: { apiKey: string; model: HarnessModel },
): Promise<HarnessResult> => {
    const Database = await loadSqlite();
    const dbFile = configDbPath(ctx);
    if (!existsSync(dbFile)) {
        throw new Error(
            `Claude Code Router config database not found at ${dbFile}. ${INSTALL_HINT}`,
        );
    }

    const existingRow = readConfigRow(Database, dbFile);
    const snapshot =
        readRowSnapshot(ctx) ??
        ({
            before: existingRow?.valueJson ?? null,
            afterHash: null,
        } as RowSnapshot);
    if (readRowSnapshot(ctx) === null) writeRowSnapshot(ctx, snapshot);

    const config = (await readConfig(ctx, Database)) ?? {};
    const withProvider = upsertProvider(config, {
        name: PROVIDER_NAME,
        api_base_url: BASE_URL,
        api_key: settings.apiKey,
        models: [settings.model.id],
        enabled: true,
    });
    const next = setProfileModel(withProvider.config, settings.model.id);
    const nextValueJson = JSON.stringify(next.config);

    try {
        writeConfigRow(Database, dbFile, nextValueJson);
    } catch (error) {
        // Roll back to the exact pre-change bytes.
        if (existingRow !== null) {
            writeConfigRow(Database, dbFile, existingRow.valueJson);
        }
        removeRowSnapshot(ctx);
        throw error;
    }
    snapshot.afterHash = hash(nextValueJson);
    writeRowSnapshot(ctx, snapshot);
    return statusResult(ctx);
};

export const disableClaudeCode = async (
    ctx: HarnessContext,
): Promise<HarnessResult> => {
    const Database = await loadSqlite();
    const dbFile = configDbPath(ctx);
    const snapshot = readRowSnapshot(ctx);
    const currentRow = readConfigRow(Database, dbFile);
    let outcome: "restored" | "stripped" | "unchanged" = "unchanged";

    const untouched =
        snapshot?.afterHash !== null &&
        snapshot !== null &&
        currentRow !== null &&
        hash(currentRow.valueJson) === snapshot.afterHash;

    if (untouched) {
        // Byte-for-byte restore of the pre-`on` row.
        if (snapshot.before !== null) {
            writeConfigRow(Database, dbFile, snapshot.before);
        }
        removeRowSnapshot(ctx);
        return {
            ...(await statusResult(ctx)),
            configured: false,
            outcome: "restored",
        };
    }

    const config = await readConfig(ctx, Database);
    if (config) {
        const stripped = stripProvider(config);
        if (stripped.changed) {
            writeConfigRow(Database, dbFile, JSON.stringify(stripped.config));
            outcome = "stripped";
        }
    }
    removeRowSnapshot(ctx);
    return { ...(await statusResult(ctx)), configured: false, outcome };
};

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Claude Code to use Pollinations through Claude Code Router",
    restartHint:
        "Restart the router (`ccr`) and Claude Code, then start a task — requests route through the pollinations provider.",

    async on(ctx, options) {
        if (
            !commandExists("claude", ctx.env, [
                join(ctx.home, ".claude", "local", "claude"),
            ])
        ) {
            throw new Error(
                "Claude Code was not found on PATH. Install it first: https://claude.com/claude-code — then re-run polli harness claude-code on.",
            );
        }
        if (!existsSync(configDbPath(ctx))) {
            throw new Error(
                `Claude Code Router config database not found at ${configDbPath(ctx)}. ${INSTALL_HINT}`,
            );
        }
        const modelId = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(modelId);
        const model = models.find(
            (entry) => entry.id === modelId,
        ) as HarnessModel;
        const Database = await loadSqlite();
        const config = await readConfig(ctx, Database);
        const provider = config?.Providers?.find(isPollinations) as
            | PollinationsProvider
            | undefined;
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: provider?.api_key ?? null,
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        const smoke = await smokeChat(apiKey, model.id);
        if (!smoke.ok) {
            throw new Error(
                `Smoke request failed before any config change: ${smoke.detail}`,
            );
        }
        const result = await configureClaudeCode(ctx, { apiKey, model });
        printInfo(`Smoke request ok ("${smoke.detail}").`);
        return result;
    },

    off: disableClaudeCode,
    status: statusResult,
};
