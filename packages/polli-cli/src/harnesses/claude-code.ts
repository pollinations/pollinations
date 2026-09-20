import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { smokeTest } from "./smoke.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
    OffOutcome,
} from "./types.js";

const ID = "claude-code";
const LABEL = "Claude Code";
const PROVIDER_ID = "pollinations";
const PROVIDER_NAME = "Pollinations.ai";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";
// The single row Claude Code Router keeps its whole config under.
const APP_CONFIG_KEY = "default";

/**
 * Claude Code Router (https://github.com/musistudio/claude-code-router) keeps
 * its config in a SQLite database (`config.sqlite`), one `app_config` row
 * (key `"default"`) whose `value_json` is the entire config document -- the
 * classic `config.json` format only exists as a one-time migration source, so
 * this adapter reads and writes that row directly.
 */
export const claudeCodeRouterConfigDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "claude-code-router",
        );
    }
    return join(ctx.home, ".claude-code-router");
};

const dbPath = (ctx: HarnessContext) =>
    join(claudeCodeRouterConfigDir(ctx), "config.sqlite");
const snapshotPath = (ctx: HarnessContext) =>
    join(ctx.home, ".pollinations", "harnesses", "claude-code.json");

const files = (ctx: HarnessContext) => [dbPath(ctx)];

type SqliteModule = typeof import("node:sqlite");

const loadSqlite = async (): Promise<SqliteModule> => {
    try {
        return await import("node:sqlite");
    } catch (error) {
        throw new Error(
            "Claude Code Router needs node:sqlite, which is unavailable on this Node. " +
                "Upgrade Node, or re-run with: NODE_OPTIONS=--experimental-sqlite npx @pollinations/cli@latest harness claude-code on",
            { cause: error },
        );
    }
};

const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");

interface DbSnapshot {
    complete: boolean;
    before: string | null;
    afterHash: string | null;
}

const loadDbSnapshot = (ctx: HarnessContext): DbSnapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx));
    return text ? (JSON.parse(text) as DbSnapshot) : null;
};

const saveDbSnapshot = (ctx: HarnessContext, snapshot: DbSnapshot) =>
    writeTextAtomic(
        snapshotPath(ctx),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );

const clearDbSnapshot = (ctx: HarnessContext) =>
    removeIfExists(snapshotPath(ctx));

const defaultAppConfig = () => ({
    APIKEY: "",
    APIKEYS: [],
    HOST: "127.0.0.1",
    PORT: 3456,
    Providers: [] as Record<string, unknown>[],
    Router: {
        builtInRules: {
            "claude-code": { enabled: true },
            codex: { enabled: true },
        },
        fallback: { mode: "off", models: [], retryCount: 1 },
        rules: [],
    },
    profile: { claudeCode: { enabled: true, model: "" } },
});

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const providerEntry = (models: HarnessModel[]) => ({
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    api_base_url: `${BASE_URL}/v1`,
    type: "openai_chat_completions",
    models: models.map((model) => model.id),
    enabled: true,
});

const modelSelector = (model: string) => `${PROVIDER_NAME}/${model}`;
const isOurSelector = (value: unknown) =>
    typeof value === "string" && value.startsWith(`${PROVIDER_NAME}/`);

const withDatabase = async <T>(
    ctx: HarnessContext,
    fn: (db: InstanceType<SqliteModule["DatabaseSync"]>) => T,
): Promise<T> => {
    const { DatabaseSync } = await loadSqlite();
    mkdirSync(dirname(dbPath(ctx)), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(dbPath(ctx));
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `);
        return fn(db);
    } finally {
        db.close();
    }
};

// A read never creates the database: a status check on a machine that never
// ran `on` must not leave a stray `config.sqlite` behind, and must not
// require `node:sqlite` just to say "not configured".
const readAppConfig = async (
    ctx: HarnessContext,
): Promise<Record<string, unknown> | undefined> => {
    if (!existsSync(dbPath(ctx))) return undefined;
    return withDatabase(ctx, (db) => {
        const row = db
            .prepare("SELECT value_json FROM app_config WHERE key = ?")
            .get(APP_CONFIG_KEY) as { value_json: string } | undefined;
        return row
            ? (JSON.parse(row.value_json) as Record<string, unknown>)
            : undefined;
    });
};

const writeAppConfig = async (
    ctx: HarnessContext,
    config: Record<string, unknown>,
) =>
    withDatabase(ctx, (db) => {
        db.prepare(
            `INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        ).run(APP_CONFIG_KEY, JSON.stringify(config), new Date().toISOString());
    });

const deleteAppConfigRow = async (ctx: HarnessContext) =>
    withDatabase(ctx, (db) => {
        db.prepare("DELETE FROM app_config WHERE key = ?").run(APP_CONFIG_KEY);
    });

interface ClaudeCodeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const mutate = (
    config: Record<string, unknown>,
    settings: ClaudeCodeSettings,
) => {
    const providers = Array.isArray(config.Providers)
        ? (config.Providers as Record<string, unknown>[])
        : [];
    config.Providers = [
        ...providers.filter((p) => p.id !== PROVIDER_ID),
        { ...providerEntry(settings.models), api_key: settings.apiKey },
    ];
    const profile = asRecord(config.profile);
    const claudeCode = asRecord(profile.claudeCode);
    claudeCode.model = modelSelector(settings.model);
    if (claudeCode.enabled === undefined) claudeCode.enabled = true;
    profile.claudeCode = claudeCode;
    config.profile = profile;
    return config;
};

const stripMutate = (config: Record<string, unknown>): boolean => {
    let changed = false;
    const providers = Array.isArray(config.Providers)
        ? (config.Providers as Record<string, unknown>[])
        : [];
    if (providers.some((p) => p.id === PROVIDER_ID)) {
        config.Providers = providers.filter((p) => p.id !== PROVIDER_ID);
        changed = true;
    }
    const profile = asRecord(config.profile);
    const claudeCode = asRecord(profile.claudeCode);
    if (isOurSelector(claudeCode.model)) {
        claudeCode.model = "";
        profile.claudeCode = claudeCode;
        config.profile = profile;
        changed = true;
    }
    return changed;
};

export const configureClaudeCode = async (
    ctx: HarnessContext,
    settings: ClaudeCodeSettings,
): Promise<HarnessResult> => {
    const snapshot = loadDbSnapshot(ctx);
    const before = existsSync(dbPath(ctx))
        ? JSON.stringify((await readAppConfig(ctx)) ?? null)
        : null;
    const record: DbSnapshot = snapshot ?? {
        complete: false,
        before,
        afterHash: null,
    };
    if (!snapshot) saveDbSnapshot(ctx, record);

    const current = (await readAppConfig(ctx)) ?? defaultAppConfig();
    await writeAppConfig(ctx, mutate(current, settings));

    const after = JSON.stringify((await readAppConfig(ctx)) ?? null);
    record.afterHash = sha256(after);
    record.complete = true;
    saveDbSnapshot(ctx, record);

    return result(ctx);
};

export const disableClaudeCode = async (
    ctx: HarnessContext,
): Promise<HarnessResult> => {
    if (!existsSync(dbPath(ctx))) {
        clearDbSnapshot(ctx);
        return {
            ...(await result(ctx)),
            configured: false,
            outcome: "unchanged",
        };
    }

    const snapshot = loadDbSnapshot(ctx);
    const currentHash = sha256(
        JSON.stringify((await readAppConfig(ctx)) ?? null),
    );
    let outcome: OffOutcome;

    if (snapshot?.complete && snapshot.afterHash === currentHash) {
        if (snapshot.before === null) {
            await deleteAppConfigRow(ctx);
        } else {
            await writeAppConfig(
                ctx,
                JSON.parse(snapshot.before) as Record<string, unknown>,
            );
        }
        outcome = "restored";
    } else {
        const current = (await readAppConfig(ctx)) ?? defaultAppConfig();
        const changed = stripMutate(current);
        if (changed) await writeAppConfig(ctx, current);
        outcome = changed ? "stripped" : "unchanged";
    }
    clearDbSnapshot(ctx);

    return { ...(await result(ctx)), configured: false, outcome };
};

const result = async (ctx: HarnessContext): Promise<HarnessResult> => {
    const config = (await readAppConfig(ctx)) ?? {};
    const providers = Array.isArray(config.Providers)
        ? (config.Providers as Record<string, unknown>[])
        : [];
    const provider = providers.find((p) => p.id === PROVIDER_ID);
    const claudeCode = asRecord(asRecord(config.profile).claudeCode);
    const selector = claudeCode.model;
    return {
        harness: ID,
        label: LABEL,
        configured:
            provider?.api_base_url === `${BASE_URL}/v1` &&
            typeof provider?.api_key === "string" &&
            provider.api_key.length > 0 &&
            isOurSelector(selector),
        model: isOurSelector(selector)
            ? (selector as string).slice(`${PROVIDER_NAME}/`.length)
            : undefined,
        files: files(ctx),
    };
};

const claudeInstalled = (ctx: HarnessContext) =>
    commandExists("claude", ctx.env);
const ccrInstalled = (ctx: HarnessContext) => commandExists("ccr", ctx.env);

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Claude Code to use Pollinations through Claude Code Router",
    restartHint:
        "Restart Claude Code Router: ccr stop && ccr start. Claude Code then routes to Pollinations through the configured profile.",

    async on(ctx, options) {
        if (!claudeInstalled(ctx)) {
            throw new Error(
                "Claude Code was not found. Install it first: npm install -g @anthropic-ai/claude-code",
            );
        }
        if (!ccrInstalled(ctx)) {
            throw new Error(
                "Claude Code Router was not found. Install it first: npm install -g @musistudio/claude-code-router",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);

        const existing = (await readAppConfig(ctx)) ?? {};
        const existingProvider = (
            Array.isArray(existing.Providers) ? existing.Providers : []
        ).find((p) => (p as Record<string, unknown>).id === PROVIDER_ID) as
            | Record<string, unknown>
            | undefined;
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey:
                    typeof existingProvider?.api_key === "string"
                        ? existingProvider.api_key
                        : null,
            },
            { browser: options.browser },
        );
        const configured = await configureClaudeCode(ctx, {
            apiKey,
            model,
            models,
        });
        await smokeTest(apiKey, model);
        return configured;
    },

    off: disableClaudeCode,
    status: result,
};
