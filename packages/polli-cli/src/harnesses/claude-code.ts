import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { printInfo } from "../lib/output.js";
import { commandExists, readTextIfExists, resolveHomePath } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import { applyWithSnapshot, restoreOrStrip } from "./snapshot.js";
import type { HarnessAdapter, HarnessContext, HarnessResult } from "./types.js";

type DatabaseSyncCtor = typeof import("node:sqlite").DatabaseSync;

// node:sqlite needs Node 22.5+, while the CLI itself supports Node 20, so the
// module is loaded lazily and only when this adapter actually touches CCR's
// config database.
const databaseSync = (): DatabaseSyncCtor => {
    try {
        return createRequire(import.meta.url)("node:sqlite")
            .DatabaseSync as DatabaseSyncCtor;
    } catch {
        throw new Error(
            "Configuring Claude Code Router requires Node.js 22.5+ (node:sqlite).",
        );
    }
};

const ID = "claude-code";
const LABEL = "Claude Code";
// Cheap, tool-capable, first-party. `--model` always wins; this only has to
// exist in the live catalog, which every `on` validates.
const DEFAULT_MODEL = "z-ai/glm-5.3-flash";
const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai/v1";
const PROVIDER_ID = "pollinations";
const PROFILE_ID = "pollinations";
const PROFILE_NAME = "Pollinations";
const PROFILE_KEY_ID = `profile:${PROFILE_ID}`;
const GATEWAY_PORT = 3456;

// CCR resolves its config dir the way packages/core/src/runtime/app-paths.ts
// does: CCR_INTERNAL_HOME_DIR overrides the home, Windows uses %APPDATA%.
const ccrConfigDir = (ctx: HarnessContext) => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "claude-code-router",
        );
    }
    const home = ctx.env.CCR_INTERNAL_HOME_DIR?.trim()
        ? resolveHomePath(ctx.home, ctx.env.CCR_INTERNAL_HOME_DIR.trim())
        : ctx.home;
    return join(home, ".claude-code-router");
};

const configFile = (ctx: HarnessContext) =>
    join(ccrConfigDir(ctx), "config.sqlite");
const serviceFile = (ctx: HarnessContext) =>
    join(ccrConfigDir(ctx), "service.json");

/** The one file the adapter may create or change (a byte-exact copy is kept). */
const files = (ctx: HarnessContext) => [configFile(ctx)];

interface CcrServiceState {
    pid?: number;
    url?: string;
}

interface CcrProvider {
    name?: string;
    api_base_url?: string;
    api_key?: string;
    models?: string[];
    enabled?: boolean;
    autoFetchModels?: boolean;
}

interface CcrProfile {
    id?: string;
    name?: string;
    agent?: string;
    scope?: string;
    enabled?: boolean;
    model?: string;
    surface?: string;
}

interface CcrConfig {
    Providers?: CcrProvider[];
    profile?: { profiles?: CcrProfile[] } & Record<string, unknown>;
    [key: string]: unknown;
}

const servicePid = (ctx: HarnessContext): number | null => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) return null;
    try {
        const state = JSON.parse(text) as CcrServiceState;
        const pid = state.pid;
        if (typeof pid !== "number" || pid <= 0) return null;
        process.kill(pid, 0);
        return pid;
    } catch {
        return null;
    }
};

/**
 * Offline config access through node:sqlite — the same storage CCR itself
 * uses (one JSON document in app_config under key "default"). Only safe
 * against a live service for reads; writers check servicePid first.
 */
const openDb = (ctx: HarnessContext, create: boolean) => {
    const path = configFile(ctx);
    if (!create && !existsSync(path)) return null;
    if (create) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    return new (databaseSync())(path);
};

const ensureSchema = (db: DatabaseSync) => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            encrypted_key TEXT NOT NULL,
            encryption TEXT NOT NULL DEFAULT 'plain',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL DEFAULT '',
            limits_json TEXT NOT NULL DEFAULT ''
        );
    `);
};

const loadConfig = (db: DatabaseSync): CcrConfig => {
    const row = db
        .prepare("SELECT value_json FROM app_config WHERE key = 'default'")
        .get() as { value_json: string } | undefined;
    if (!row) return {};
    return JSON.parse(row.value_json) as CcrConfig;
};

const saveConfig = (db: DatabaseSync, config: CcrConfig) => {
    db.prepare(
        `INSERT INTO app_config (key, value_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
             updated_at = excluded.updated_at`,
    ).run(JSON.stringify(config), new Date().toISOString());
};

const upsertApiKey = (
    db: DatabaseSync,
    key: { id: string; name: string; value: string },
) => {
    db.prepare(
        `INSERT INTO api_keys (id, name, encrypted_key, encryption, created_at, expires_at, limits_json)
         VALUES (?, ?, ?, 'plain', ?, '', '')
         ON CONFLICT(id) DO UPDATE SET encrypted_key = excluded.encrypted_key,
             name = excluded.name`,
    ).run(key.id, key.name, key.value, new Date().toISOString());
};

const readApiKeyRow = (db: DatabaseSync, id: string): string | null => {
    const row = db
        .prepare("SELECT encrypted_key FROM api_keys WHERE id = ?")
        .get(id) as { encrypted_key: string } | undefined;
    return row?.encrypted_key ?? null;
};

/** Read-only config access, even while the CCR service is running. */
const readConfig = (ctx: HarnessContext): CcrConfig | null => {
    const db = openDb(ctx, false);
    if (!db) return null;
    try {
        return loadConfig(db);
    } finally {
        db.close();
    }
};

const ourProvider = (config: CcrConfig): CcrProvider | undefined =>
    config.Providers?.find((provider) => provider.name === PROVIDER_ID);

const ourProfile = (config: CcrConfig): CcrProfile | undefined =>
    config.profile?.profiles?.find((profile) => profile.id === PROFILE_ID);

const readProviderKey = (ctx: HarnessContext): string | null => {
    const key = readConfig(ctx)?.Providers?.find(
        (provider) => provider.name === PROVIDER_ID,
    )?.api_key;
    return typeof key === "string" && key.length > 5 ? key : null;
};

const newProfileKey = () =>
    `ccr-profile-${randomBytes(24).toString("base64url")}`;

/** Synchronous RPC against a running CCR management service. */
const rpc = <T>(ctx: HarnessContext, method: string, args: unknown[]): T => {
    const text = readTextIfExists(serviceFile(ctx));
    const state = text ? (JSON.parse(text) as CcrServiceState) : null;
    if (!state?.url) throw new Error("CCR service state is unreadable.");
    const url = new URL(state.url);
    const token = url.searchParams.get("ccr_web_token") ?? "";
    const script = `fetch(${JSON.stringify(url.origin + "/api/ccr/rpc")}, {
            method: "POST",
            headers: { "content-type": "application/json", "x-ccr-web-auth": ${JSON.stringify(token)} },
            body: process.argv[1],
        })
        .then((response) => response.text())
        .then((body) => process.stdout.write(body));`;
    const raw = execFileSync(
        process.execPath,
        ["-e", script, JSON.stringify({ method, args })],
        {
            timeout: 60_000,
            encoding: "utf-8",
        },
    );
    const parsed = JSON.parse(raw) as {
        ok: boolean;
        value?: T;
        error?: { message?: string };
    };
    if (!parsed.ok) {
        throw new Error(parsed.error?.message ?? `CCR RPC ${method} failed`);
    }
    return parsed.value as T;
};

const gatewayHealthy = (ctx: HarnessContext) => {
    try {
        const output = execFileSync(
            process.execPath,
            [
                "-e",
                `fetch("http://127.0.0.1:${GATEWAY_PORT}/health")
                    .then((response) => process.stdout.write(response.ok ? "ok" : "down"))
                    .catch(() => process.stdout.write("down"));`,
            ],
            { timeout: 10_000, encoding: "utf-8" },
        );
        return output.trim() === "ok";
    } catch {
        return false;
    }
};

const ensureGateway = (ctx: HarnessContext) => {
    if (gatewayHealthy(ctx)) return true;
    if (!commandExists("ccr", ctx.env, [])) return false;
    try {
        execFileSync("ccr", ["start", "--no-open"], {
            timeout: 60_000,
            encoding: "utf-8",
            env: ctx.env,
        });
    } catch {
        return false;
    }
    // The daemon boots asynchronously; give the health endpoint a moment.
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (gatewayHealthy(ctx)) return true;
        execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 250);"], {
            timeout: 5000,
        });
    }
    return false;
};
/**
 * One-word request through the running gateway, authenticated with a key
 * from CCR's own key table. Proves Claude Code's wire path (Anthropic
 * Messages at :3456) reaches Pollinations and back. Best effort: a gateway
 * that cannot be started (headless machine, daemon refuses) skips the
 * smoke with a note instead of failing an otherwise-valid setup; a gateway
 * that IS up but answers wrong fails the setup.
 */
const smoke = (ctx: HarnessContext, model: string) => {
    if (!ensureGateway(ctx)) {
        printInfo(
            "CCR gateway is not running; skipped the smoke request. Start CCR and run `polli harness claude-code status` to smoke-test.",
        );
        return;
    }
    const db = openDb(ctx, false);
    if (!db) throw new Error("CCR config disappeared during setup.");
    let key: string | null;
    try {
        key =
            readApiKeyRow(db, PROFILE_KEY_ID) ??
            readApiKeyRow(db, "local-gateway");
    } finally {
        db.close();
    }
    if (!key) throw new Error("CCR gateway key not found for smoke test.");
    const script = `fetch("http://127.0.0.1:${GATEWAY_PORT}/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": process.argv[1] },
            body: JSON.stringify({
                model: process.argv[2],
                max_tokens: 16,
                messages: [{ role: "user", content: "Reply with exactly one word: pong" }],
            }),
        })
        .then((response) => response.text())
        .then((body) => process.stdout.write(body));`;
    let body: string;
    try {
        body = execFileSync(
            process.execPath,
            ["-e", script, key, `${PROVIDER_ID}/${model}`],
            { timeout: 120_000, encoding: "utf-8" },
        );
    } catch (error) {
        throw new Error(
            `Smoke request through Claude Code Router failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
        );
    }
    if (!body.includes("pong")) {
        throw new Error("Smoke request did not answer pong.");
    }
};

const buildProvider = (settings: {
    apiKey: string;
    model: string;
}): CcrProvider => ({
    name: PROVIDER_ID,
    api_base_url: POLLINATIONS_BASE_URL,
    api_key: settings.apiKey,
    models: [settings.model],
    enabled: true,
    // CCR re-probes GET {base}/models with this key and keeps its own
    // catalog fresh — no stale hardcoded model list of ours.
    autoFetchModels: true,
});

const buildProfile = (model: string): CcrProfile => ({
    id: PROFILE_ID,
    name: PROFILE_NAME,
    agent: "claude-code",
    // "Only opened from CCR": the generated settings live under CCR's own
    // profiles dir and the user's ~/.claude is never touched.
    scope: "ccr",
    enabled: true,
    model: `${PROVIDER_ID}/${model}`,
    surface: "cli",
    env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" },
});

/**
 * Write our provider + profile into the CCR config document. When the
 * management service is running this goes through its own saveConfig RPC
 * (which applies profiles live); otherwise the same sqlite document is
 * written offline, exactly as CCR's own CLI does before first start.
 */
const applyConfig = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string },
) => {
    const running = servicePid(ctx) !== null;
    if (running) {
        const config = rpc<CcrConfig>(ctx, "getConfig", []);
        config.Providers = [
            ...(config.Providers ?? []).filter(
                (provider) => provider.name !== PROVIDER_ID,
            ),
            buildProvider(settings),
        ];
        const profile = config.profile ?? {};
        profile.profiles = [
            ...(profile.profiles ?? []).filter(
                (candidate) => candidate.id !== PROFILE_ID,
            ),
            buildProfile(settings.model),
        ];
        config.profile = profile;
        rpc<CcrConfig>(ctx, "saveConfig", [config, { applyProfile: true }]);
        return;
    }

    const db = openDb(ctx, true);
    try {
        ensureSchema(db);
        const config = loadConfig(db);
        config.Providers = [
            ...(config.Providers ?? []).filter(
                (provider) => provider.name !== PROVIDER_ID,
            ),
            buildProvider(settings),
        ];
        const profile = config.profile ?? {};
        profile.profiles = [
            ...(profile.profiles ?? []).filter(
                (candidate) => candidate.id !== PROFILE_ID,
            ),
            buildProfile(settings.model),
        ];
        config.profile = profile;
        saveConfig(db, config);
        // Gateway client keys live in CCR's own key table (never inline in
        // the document). Bootstrap the local key CCR would create, plus the
        // profile key its profile apply would mint.
        if (!readApiKeyRow(db, "local-gateway")) {
            upsertApiKey(db, {
                id: "local-gateway",
                name: "Local Gateway",
                value: `sk-ccr-${randomBytes(32).toString("base64url")}`,
            });
        }
        upsertApiKey(db, {
            id: PROFILE_KEY_ID,
            name: `Profile: ${PROFILE_NAME}`,
            value: readApiKeyRow(db, PROFILE_KEY_ID) ?? newProfileKey(),
        });
    } finally {
        db.close();
    }
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const running = servicePid(ctx) !== null;
    if (running) {
        const config = rpc<CcrConfig>(ctx, "getConfig", []);
        const hadProvider = config.Providers?.some(
            (provider) => provider.name === PROVIDER_ID,
        );
        const hadProfile = config.profile?.profiles?.some(
            (candidate) => candidate.id === PROFILE_ID,
        );
        if (!hadProvider && !hadProfile) return false;
        config.Providers = (config.Providers ?? []).filter(
            (provider) => provider.name !== PROVIDER_ID,
        );
        const profile = config.profile ?? {};
        profile.profiles = (profile.profiles ?? []).filter(
            (candidate) => candidate.id !== PROFILE_ID,
        );
        config.profile = profile;
        rpc<CcrConfig>(ctx, "saveConfig", [config, { applyProfile: true }]);
        return true;
    }

    const db = openDb(ctx, false);
    if (!db) return false;
    try {
        ensureSchema(db);
        const config = loadConfig(db);
        const hadProvider = config.Providers?.some(
            (provider) => provider.name === PROVIDER_ID,
        );
        const hadProfile = config.profile?.profiles?.some(
            (candidate) => candidate.id === PROFILE_ID,
        );
        if (!hadProvider && !hadProfile) return false;
        config.Providers = (config.Providers ?? []).filter(
            (provider) => provider.name !== PROVIDER_ID,
        );
        const profile = config.profile ?? {};
        profile.profiles = (profile.profiles ?? []).filter(
            (candidate) => candidate.id !== PROFILE_ID,
        );
        config.profile = profile;
        saveConfig(db, config);
        db.prepare("DELETE FROM api_keys WHERE id = ?").run(PROFILE_KEY_ID);
        return true;
    } finally {
        db.close();
    }
};

const result = (ctx: HarnessContext): HarnessResult => {
    let configured = false;
    let model: string | undefined;
    try {
        const config = readConfig(ctx);
        const profile = config ? ourProfile(config) : undefined;
        configured = Boolean(
            config &&
                // CCR treats a missing enabled as on; only false disables.
                ourProvider(config)?.enabled !== false &&
                profile?.enabled &&
                profile.model?.startsWith(`${PROVIDER_ID}/`),
        );
        model = profile?.model?.slice(`${PROVIDER_ID}/`.length);
    } catch {
        configured = false;
    }
    return {
        harness: ID,
        label: LABEL,
        configured,
        model,
        files: files(ctx),
    };
};

export const configureClaudeCode = (
    ctx: HarnessContext,
    settings: { apiKey: string; model: string },
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => {
        applyConfig(ctx, settings);
        smoke(ctx, settings.model);
    });
    return result(ctx);
};

export const disableClaudeCode = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    // Disk truth wins: a byte-for-byte restore may legitimately bring
    // back a pre-existing Pollinations setup the user had before `on`.
    return { ...result(ctx), outcome };
};

const claudeInstalled = (ctx: HarnessContext) =>
    commandExists("claude", ctx.env, [
        join(ctx.home, ".local", "bin", "claude"),
    ]);

const ccrInstalled = (ctx: HarnessContext) => commandExists("ccr", ctx.env, []);

export const claudeCode: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description:
        "Configure Claude Code through Claude Code Router to use Pollinations",
    restartHint:
        'Run `ccr "Pollinations"` (or start CCR and pick the Pollinations profile) to launch Claude Code on Pollinations.',

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
        await fetchHarnessModels(model);
        const apiKey = await resolveHarnessKey(
            {
                id: ID,
                label: LABEL,
                existingKey: readProviderKey(ctx),
                accountPermissions: ["profile", "usage"],
            },
            { browser: options.browser },
        );
        const result = configureClaudeCode(ctx, { apiKey, model });
        // Usage side effect under the dedicated key: the routed smoke
        // request should be visible to the key that paid for it. Courtesy
        // check — the pong already proved the authenticated round trip.
        try {
            await gen("/account/usage/daily", { apiKey });
        } catch {
            // Usage reporting can lag; never fail a working setup over it.
        }
        return result;
    },

    off: disableClaudeCode,

    // status doubles as the missing-prerequisite report the harness docs
    // promise: a missing binary or router fails loudly with the official
    // install pointer instead of a quiet `configured: false`.
    status: (ctx) => {
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
        return result(ctx);
    },
};
